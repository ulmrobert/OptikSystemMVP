// Eingang der Funduskamera (Tabelle fundus_eingang): Aufnahmen, die das
// Hilfsprogramm tools/fundus-import übertragen hat und die keinem Kunden
// eindeutig zugeordnet werden konnten. Hilfsfunktionen ohne React.

export type FundusEingang = {
  id: number;
  created_at: string;
  Pfad: string;
  Dateiname: string;
  Aufnahme: string | null;
  Auge: "R" | "L" | null;
  Patient_Nachname: string | null;
  Patient_Vorname: string | null;
  Patient_Geburtsdatum: string | null;
  Patient_ID: string | null;
  Geraet: string | null;
};

export type KundeTreffer = {
  kunde_id: number;
  Nachname: string | null;
  Vorname: string | null;
  Geburtsdatum: string | null;
  KundenNummer: string | null;
};

const datumDe = (iso: string | null | undefined): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
};

/** "Hölzl, Antonia (geb. 15.03.1972, ID 23625)" – was die Kamera weiß. */
export const kameraPatient = (e: FundusEingang): string => {
  const name = [e.Patient_Nachname, e.Patient_Vorname]
    .filter(Boolean)
    .join(", ");
  const zusatz = [
    e.Patient_Geburtsdatum ? `geb. ${datumDe(e.Patient_Geburtsdatum)}` : "",
    e.Patient_ID ? `ID ${e.Patient_ID}` : "",
  ].filter(Boolean);
  const klammer = zusatz.length ? `(${zusatz.join(", ")})` : "";
  return [name || "ohne Namen", klammer].filter(Boolean).join(" ");
};

export const augeText = (auge: FundusEingang["Auge"]): string =>
  auge === "R" ? "rechts" : auge === "L" ? "links" : "Auge unbekannt";

/** "Hölzl, Antonia · 15.03.1972 · Kd.-Nr. 23625" für die Kundenauswahl. */
export const kundeText = (k: KundeTreffer): string =>
  [
    [k.Nachname, k.Vorname].filter(Boolean).join(", ") || `Kunde ${k.kunde_id}`,
    k.Geburtsdatum ? datumDe(k.Geburtsdatum) : "",
    k.KundenNummer ? `Kd.-Nr. ${k.KundenNummer}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

/**
 * Suche in der Kundenauswahl auswerten: nur Ziffern = Kundennummer,
 * sonst "Nachname [Vorname]".
 */
export const kundenSuche = (
  eingabe: string,
): { kundennummer: string } | { nachname: string; vorname: string } | null => {
  const t = eingabe.trim();
  if (t.length < 2) return null;
  if (/^\d+$/.test(t)) return { kundennummer: t };
  const [nachname, ...rest] = t.split(/[\s,]+/).filter(Boolean);
  return { nachname, vorname: rest.join(" ") };
};
