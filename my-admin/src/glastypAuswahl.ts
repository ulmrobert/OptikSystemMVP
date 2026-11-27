// Reihenfolge der Vorschläge im Feld "Glastyp" der Brillenkartei: zuerst die
// meistverkauften Gläser (View glastyp_haeufigkeit), danach alle übrigen
// Bezeichnungen alphabetisch. Ohne React, damit es sich testen lässt.

export type GlastypHaeufigkeit = {
  Bezeichnung: string | null;
  Anzahl: number | null;
};

export const HAEUFIGSTE_ANZAHL = 10;

const schluessel = (name: string) =>
  name.trim().replace(/\s+/g, " ").toLowerCase();

export const glastypVorschlaege = (
  haeufig: GlastypHaeufigkeit[],
  alle: string[],
  anzahl: number = HAEUFIGSTE_ANZAHL,
): string[] => {
  const oben = haeufig
    .filter((h) => (h.Bezeichnung ?? "").trim() && (h.Anzahl ?? 0) > 0)
    .sort((a, b) => (b.Anzahl ?? 0) - (a.Anzahl ?? 0))
    .slice(0, anzahl)
    .map((h) => (h.Bezeichnung as string).trim().replace(/\s+/g, " "));
  const gesehen = new Set(oben.map(schluessel));
  const rest: string[] = [];
  for (const name of alle) {
    const t = name.trim();
    if (!t || gesehen.has(schluessel(t))) continue;
    gesehen.add(schluessel(t));
    rest.push(t);
  }
  rest.sort((a, b) => a.localeCompare(b, "de"));
  return [...oben, ...rest];
};
