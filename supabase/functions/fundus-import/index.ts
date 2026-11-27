// Nimmt Fundusaufnahmen vom Hilfsprogramm tools/fundus-import (Praxis-PC an
// der Funduskamera iCare DRSplus) entgegen:
//   POST, Body = JPEG-Bild (roh), Kopfzeilen:
//     x-fundus-token  gemeinsames Geheimnis (Secret FUNDUS_IMPORT_TOKEN)
//     x-fundus-meta   Base64-JSON mit den Patientendaten aus der DICOM-Datei
//
// Die Datei landet im privaten Bucket kunde-dokumente unter
// fundus-eingang/<JJJJ-MM>/<zufall>-<dateiname>, der Eintrag in
// public.fundus_eingang. Ein Trigger ordnet die Aufnahme dort automatisch dem
// Kunden zu, wenn er eindeutig ist (siehe Migration fundus_eingang).
//
// Das Hilfsprogramm hat keine Anmeldung, deshalb ohne JWT-Prüfung bereit-
// stellen und nur über das Token absichern:
//   supabase functions deploy fundus-import --project-ref <ref> --no-verify-jwt
//
// Secrets: FUNDUS_IMPORT_TOKEN (Pflicht, mind. 32 Zeichen, zufällig).
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const BUCKET = 'kunde-dokumente';
const MAX_BYTES = 25 * 1024 * 1024;

const antwort = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });

/** Vergleich ohne Zeitunterschiede je nach Anzahl passender Zeichen. */
const gleich = (a: string, b: string) => {
    const x = new TextEncoder().encode(a);
    const y = new TextEncoder().encode(b);
    let unterschied = x.length ^ y.length;
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
        unterschied |= (x[i] ?? 0) ^ (y[i] ?? 0);
    }
    return unterschied === 0;
};

type Meta = {
    dateiname?: string;
    aufnahme?: string | null; // ISO-Zeitpunkt
    auge?: string | null; // R | L
    nachname?: string | null;
    vorname?: string | null;
    geburtsdatum?: string | null; // JJJJ-MM-TT
    patientId?: string | null;
    geraet?: string | null;
};

const text = (wert: unknown, max = 120): string | null => {
    if (typeof wert !== 'string') return null;
    const t = wert.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
    return t === '' ? null : t;
};

const datum = (wert: unknown): string | null => {
    const t = text(wert, 10);
    if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
    return Number.isNaN(Date.parse(`${t}T00:00:00Z`)) ? null : t;
};

const zeitpunkt = (wert: unknown): string | null => {
    const t = text(wert, 40);
    if (!t) return null;
    const ms = Date.parse(t);
    return Number.isNaN(ms) ? null : new Date(ms).toISOString();
};

const sichererName = (name: string) =>
    name
        .split(/[\\/]/)
        .pop()!
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/ß/g, 'ss')
        .replace(/[^A-Za-z0-9._-]+/g, '_')
        .replace(/^[._-]+|[._-]+$/g, '')
        .slice(0, 80) || 'fundus';

const istJpeg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const istPng = (b: Uint8Array) =>
    b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

Deno.serve(async (req: Request) => {
    if (req.method !== 'POST') return antwort({ error: 'Methode nicht erlaubt.' }, 405);

    const erwartet = (Deno.env.get('FUNDUS_IMPORT_TOKEN') ?? '').trim();
    if (!erwartet) {
        return antwort({ error: 'Fundus-Import ist noch nicht eingerichtet (FUNDUS_IMPORT_TOKEN fehlt).' }, 503);
    }
    if (erwartet.length < 32) {
        return antwort(
            { error: `FUNDUS_IMPORT_TOKEN ist zu kurz (${erwartet.length} Zeichen, mindestens 32).` },
            503,
        );
    }
    if (!gleich((req.headers.get('x-fundus-token') ?? '').trim(), erwartet)) {
        return antwort({ error: 'Nicht berechtigt.' }, 401);
    }

    let meta: Meta = {};
    try {
        const roh = req.headers.get('x-fundus-meta');
        if (roh) {
            const bytes = Uint8Array.from(atob(roh), (c) => c.charCodeAt(0));
            meta = JSON.parse(new TextDecoder().decode(bytes)) as Meta;
        }
    } catch {
        return antwort({ error: 'x-fundus-meta ist kein gültiges Base64-JSON.' }, 400);
    }

    const bild = new Uint8Array(await req.arrayBuffer());
    if (bild.length === 0) return antwort({ error: 'Kein Bild übertragen.' }, 400);
    if (bild.length > MAX_BYTES) return antwort({ error: 'Bild ist größer als 25 MB.' }, 413);
    const typ = istJpeg(bild) ? 'image/jpeg' : istPng(bild) ? 'image/png' : null;
    if (!typ) return antwort({ error: 'Nur JPEG- oder PNG-Bilder werden angenommen.' }, 415);

    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bild)))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        { auth: { persistSession: false } },
    );

    try {
        // Schon übernommen? (Hilfsprogramm hat nach einem Fehler erneut gesendet)
        const { data: vorhanden } = await supabase
            .from('fundus_eingang')
            .select('id, "Status", kunde_id')
            .eq('Hash', hash)
            .maybeSingle();
        if (vorhanden) {
            return antwort({ id: vorhanden.id, status: vorhanden.Status, kundeId: vorhanden.kunde_id, doppelt: true });
        }

        const dateiname = sichererName(text(meta.dateiname, 200) ?? 'fundus.jpg').replace(/\.[^.]*$/, '') +
            (typ === 'image/png' ? '.png' : '.jpg');
        const monat = new Date().toISOString().slice(0, 7);
        const pfad = `fundus-eingang/${monat}/${crypto.randomUUID()}-${dateiname}`;

        const hoch = await supabase.storage.from(BUCKET).upload(pfad, bild, { contentType: typ, upsert: false });
        if (hoch.error) {
            console.error('fundus-import upload', hoch.error);
            return antwort({ error: 'Bild konnte nicht gespeichert werden.' }, 502);
        }

        const auge = text(meta.auge, 1)?.toUpperCase();
        const { data: zeile, error } = await supabase
            .from('fundus_eingang')
            .insert({
                Pfad: pfad,
                Dateiname: text(meta.dateiname, 200) ?? dateiname,
                Typ: typ,
                Groesse: bild.length,
                Hash: hash,
                Aufnahme: zeitpunkt(meta.aufnahme),
                Auge: auge === 'R' || auge === 'L' ? auge : null,
                Patient_Nachname: text(meta.nachname),
                Patient_Vorname: text(meta.vorname),
                Patient_Geburtsdatum: datum(meta.geburtsdatum),
                Patient_ID: text(meta.patientId, 64),
                Geraet: text(meta.geraet),
            })
            .select('id')
            .single();
        if (error || !zeile) {
            console.error('fundus-import insert', error);
            await supabase.storage.from(BUCKET).remove([pfad]);
            return antwort({ error: 'Aufnahme konnte nicht eingetragen werden.' }, 502);
        }

        // Status nach dem Trigger (automatisch zugeordnet oder offen)
        const { data: stand } = await supabase
            .from('fundus_eingang')
            .select('id, "Status", kunde_id')
            .eq('id', zeile.id)
            .single();
        return antwort({ id: zeile.id, status: stand?.Status ?? 'offen', kundeId: stand?.kunde_id ?? null, doppelt: false });
    } catch (fehler) {
        console.error('fundus-import', fehler);
        return antwort({ error: 'Interner Fehler beim Fundus-Import.' }, 500);
    }
});
