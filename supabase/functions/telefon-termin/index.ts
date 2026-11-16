import { createClient } from 'npm:@supabase/supabase-js@2';

// Webhook für den KI-Telefonassistenten: legt eine Terminanfrage in
// telefon_terminanfrage an (kein Termin im Kalender, das Team bestätigt).
// Aufruf: POST mit Header "x-webhook-secret" = Secret TELEFON_WEBHOOK_SECRET
// und JSON { name, telefon, wunschtermin (ISO 8601), anliegen }.
// Deployen mit --no-verify-jwt, da der Anbieter kein Supabase-JWT sendet.

type TerminanfrageRequest = {
    name?: string;
    telefon?: string;
    wunschtermin?: string;
    anliegen?: string;
};

const jsonResponse = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });

const text = (wert: unknown, max: number): string | null =>
    typeof wert === 'string' && wert.trim() ? wert.trim().slice(0, max) : null;

// Konstanter Vergleich, damit das Secret nicht über Laufzeiten erratbar ist
const gleich = (a: string, b: string) => {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
};

Deno.serve(async (req: Request) => {
    if (req.method !== 'POST') {
        return jsonResponse({ error: 'Nur POST erlaubt.' }, 405);
    }

    const secret = Deno.env.get('TELEFON_WEBHOOK_SECRET');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!secret || !supabaseUrl || !serviceKey) {
        return jsonResponse({ error: 'Telefon-Termine sind nicht eingerichtet.' }, 500);
    }
    if (!gleich(req.headers.get('x-webhook-secret') ?? '', secret)) {
        return jsonResponse({ error: 'Nicht autorisiert.' }, 401);
    }

    let payload: TerminanfrageRequest;
    try {
        payload = await req.json();
    } catch {
        return jsonResponse({ error: 'Ungültiger Request-Body.' }, 400);
    }

    const telefon = text(payload.telefon, 40);
    if (!telefon) {
        return jsonResponse({ error: '"telefon" ist erforderlich.' }, 400);
    }

    let wunschtermin: string | null = null;
    if (payload.wunschtermin) {
        const datum = new Date(payload.wunschtermin);
        if (Number.isNaN(datum.getTime())) {
            return jsonResponse({ error: '"wunschtermin" ist kein gültiges Datum (ISO 8601).' }, 400);
        }
        wunschtermin = datum.toISOString();
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: kundeId } = await supabase.rpc('finde_kunde_nach_telefon', {
        p_telefon: telefon,
    });

    const { data, error } = await supabase
        .from('telefon_terminanfrage')
        .insert({
            kunde_id: kundeId ?? null,
            Name: text(payload.name, 120),
            Telefon: telefon,
            Wunschtermin: wunschtermin,
            Anliegen: text(payload.anliegen, 1000),
        })
        .select('id')
        .single();

    if (error) {
        return jsonResponse({ error: 'Anfrage konnte nicht gespeichert werden.' }, 500);
    }

    return jsonResponse({ id: data.id, bekannterKunde: kundeId != null }, 200);
});
