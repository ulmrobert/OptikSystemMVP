// Dateiname, Betreff und Text für den Versand von Rechnungen und Formularen
// per E-Mail/WhatsApp (Gmail wird mit Empfänger, Betreff und Text geöffnet).
import { RECHNUNG_ABSENDER } from "./rechnungTemplate";

type Kunde = Record<string, unknown> | null | undefined;

const text = (wert: unknown) =>
  wert === null || wert === undefined ? "" : String(wert).trim();

export const grussformel = (kunde: Kunde, firma = false): string => {
  if (firma) return "Sehr geehrte Damen und Herren";
  const nachname = text(kunde?.Nachname);
  const anrede = text(kunde?.Anrede);
  if (anrede === "Frau" && nachname) return `Sehr geehrte Frau ${nachname}`;
  if (anrede === "Herr" && nachname) return `Sehr geehrter Herr ${nachname}`;
  return "Guten Tag";
};

/** "Rechnung-114918-Plötner-Doreen.pdf" */
export const versandDateiname = (
  art: string,
  nummer: string,
  kunde: Kunde,
): string =>
  [art, nummer, text(kunde?.Nachname), text(kunde?.Vorname)]
    .filter(Boolean)
    .join("-")
    .replace(/[^\w.\-äöüÄÖÜß]+/g, "-")
    .replace(/-{2,}/g, "-")
    .concat(".pdf");

export type VersandArt =
  "rechnung" | "arbeitgeberRechnung" | "mahnung" | "formular";

const signatur = (gruss = "Herzliche Grüße") => {
  const a = RECHNUNG_ABSENDER;
  return [
    gruss,
    a.inhaber,
    `${a.firma} · ${a.marke}`,
    `${a.strasseLang} · ${a.plz} ${a.ort}`,
    `Tel. ${a.telefon}`,
  ]
    .filter(Boolean)
    .join("\n");
};

export const versandNachricht = ({
  art,
  titel,
  nummer,
  kunde,
}: {
  art: VersandArt;
  titel: string;
  nummer: string;
  kunde: Kunde;
}): { betreff: string; text: string } => {
  const firma = RECHNUNG_ABSENDER.firma;
  const name = [text(kunde?.Vorname), text(kunde?.Nachname)]
    .filter(Boolean)
    .join(" ");
  if (art === "rechnung") {
    return {
      betreff: `Ihre Rechnung${nummer ? ` Nr. ${nummer}` : ""} – ${firma}`,
      text: `${grussformel(kunde)},

herzlichen Dank für Ihr Vertrauen und dafür, dass Sie sich für uns entschieden haben. Es war uns eine Freude, Sie zu beraten.

Anbei erhalten Sie Ihre Rechnung${nummer ? ` Nr. ${nummer}` : ""} als PDF.

Wir hoffen, dass Sie mit Ihrer Brille rundum zufrieden sind. Sollte irgendetwas nicht ganz passen oder drücken, melden Sie sich jederzeit bei uns – wir stellen sie gern in Ruhe für Sie nach.

${signatur()}`,
    };
  }
  if (art === "arbeitgeberRechnung") {
    return {
      betreff: `Rechnung${nummer ? ` Nr. ${nummer}` : ""}${name ? ` – ${name}` : ""} – ${firma}`,
      text: `${grussformel(kunde, true)},

vielen Dank für Ihren Auftrag und das Vertrauen in unser Haus.

Anbei erhalten Sie die Rechnung${nummer ? ` Nr. ${nummer}` : ""}${name ? ` für Ihre Mitarbeiterin bzw. Ihren Mitarbeiter ${name}` : ""} als PDF.

Bei Rückfragen sind wir gern jederzeit für Sie da.

${signatur()}`,
    };
  }
  if (art === "mahnung") {
    // Zahlungserinnerung (1. Stufe): freundlich, mit Optiker-Bezug
    if (/zahlungserinnerung/i.test(titel)) {
      return {
        betreff: `Zahlungserinnerung${nummer ? ` zur Rechnung ${nummer}` : ""}: Ihre Rechnung bei ${firma} im Fokus`,
        text: `${grussformel(kunde)},

bei der Durchsicht unserer Konten ist uns eine offene Rechnung${nummer ? ` (Nr. ${nummer})` : ""} aufgefallen, die Ihnen im Alltag wohl aus dem Blickfeld geraten ist.

Alle Details zu den offenen Positionen und das Zahlungsziel finden Sie in der beigefügten Zahlungserinnerung.

Bitte überweisen Sie den offenen Betrag bis zum Zahlungsziel. Falls Sie bereits gezahlt haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.

Da Sie Ihre Rechnungen per E-Mail erhalten, senden wir Ihnen auch diese Erinnerung digital: papierlos und umweltfreundlich.

Bei Fragen oder falls Sie eine Ratenzahlung wünschen, richten wir uns gern auf Ihre Bedürfnisse ein und sorgen gemeinsam für klare Sicht.

${signatur("Mit freundlichen Grüßen")}`,
      };
    }
    return {
      betreff: `${titel}${nummer ? ` zur Rechnung ${nummer}` : ""} – ${firma}`,
      text: `${grussformel(kunde)},

anbei erhalten Sie unser Schreiben „${titel}“${nummer ? ` zur Rechnung Nr. ${nummer}` : ""} als PDF.

Sollten Sie bereits gezahlt haben, betrachten Sie dieses Schreiben bitte als gegenstandslos. Bei Fragen melden Sie sich gern bei uns.

${signatur("Mit freundlichen Grüßen")}`,
    };
  }
  return {
    betreff: `${titel}${nummer ? ` ${nummer}` : ""} – ${firma}`,
    text: `${grussformel(kunde)},

anbei erhalten Sie das Formular „${titel}“ als PDF.

Bei Fragen sind wir jederzeit gern für Sie da.

${signatur()}`,
  };
};
