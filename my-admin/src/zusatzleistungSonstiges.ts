// Zusatzleistung "Sonstiges" in der Karteikarte: der Eintrag setzt dieses
// Präfix ins Feld, dahinter wird die Leistung frei beschrieben.
export const SONSTIGES_PRAEFIX = "Sonstiges: ";

/** Freitext aus dem Feld: "Sonstiges:" ohne Beschreibung wird "Sonstiges". */
export const sonstigesText = (eingabe: string): string => {
  const t = eingabe.trim();
  return /^sonstiges:?$/i.test(t) ? "Sonstiges" : t;
};
