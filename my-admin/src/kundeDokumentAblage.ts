// Legt eine Datei automatisch in der Kundenkartei ab (Tabelle kunde_dokument,
// privater Bucket kunde-dokumente), z. B. jedes gedruckte Gutachten.
// Gleicher Dateiname beim selben Kunden = neuere Fassung ersetzt die alte,
// damit mehrfaches Drucken keine Dubletten erzeugt.
import dayjs from "dayjs";
import { supabase } from "./utils";
import {
  DOKUMENT_BUCKET,
  type DokumentArt,
  speicherPfad,
} from "./kundeDokumenteSpeicher";

export const legeDokumentBeimKundenAb = async ({
  kundeId,
  datei,
  art,
  datum = dayjs().format("YYYY-MM-DD"),
}: {
  kundeId: number;
  datei: File;
  art: DokumentArt;
  datum?: string;
}): Promise<"neu" | "ersetzt"> => {
  const { data: vorhanden, error: suchFehler } = await supabase
    .from("kunde_dokument")
    .select("id, Pfad")
    .eq("kunde_id", kundeId)
    .eq("Name", datei.name)
    .limit(1);
  if (suchFehler) throw suchFehler;
  const alt = vorhanden?.[0];

  const pfad = speicherPfad(kundeId, datei.name);
  const { error: uploadFehler } = await supabase.storage
    .from(DOKUMENT_BUCKET)
    .upload(pfad, datei, { contentType: datei.type, upsert: false });
  if (uploadFehler) throw uploadFehler;

  const werte = {
    Name: datei.name,
    Art: art,
    Datum: datum,
    Pfad: pfad,
    Typ: datei.type,
    Groesse: datei.size,
  };
  const { error: zeileFehler } = alt
    ? await supabase.from("kunde_dokument").update(werte).eq("id", alt.id)
    : await supabase
        .from("kunde_dokument")
        .insert({ kunde_id: kundeId, ...werte });
  if (zeileFehler) {
    // keine Datei ohne Eintrag zurücklassen
    await supabase.storage.from(DOKUMENT_BUCKET).remove([pfad]);
    throw zeileFehler;
  }
  // alte Fassung erst nach erfolgreichem Eintrag entfernen
  if (alt?.Pfad) {
    await supabase.storage.from(DOKUMENT_BUCKET).remove([alt.Pfad]);
  }
  return alt ? "ersetzt" : "neu";
};
