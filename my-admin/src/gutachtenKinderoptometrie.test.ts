import { describe, expect, it } from "vitest";
import dayjs from "dayjs";
import { RECHNUNG_ABSENDER } from "./rechnungTemplate";
import {
  alterText,
  buildGutachtenKinderoptometriePreviewHtml,
  buildGutachtenKinderoptometriePrintHtml,
  refraktionText,
} from "./gutachtenKinderoptometrieTemplate";

const entities = {
  kunde: { Vorname: "Mia", Nachname: "Beispiel", Geburtsdatum: "2018-05-03" },
  brille: { id: 3, Datum: "2026-10-21", BrillenArt: "Fernbrille" },
  glasRechts: { Sph: 0.5, Cyl: -0.5, A: 180, Vis: 1 },
  glasLinks: { Sph: 0.75, Cyl: -0.5, A: 175, Vis: 1 },
};

describe("Gutachten Kinderoptometrie", () => {
  it("berechnet das Alter am Untersuchungstag", () => {
    expect(alterText("2018-05-03", dayjs("2026-10-21"))).toBe(
      "8 Jahre, 5 Monate",
    );
    expect(alterText("2025-10-01", dayjs("2026-10-21"))).toBe("1 Jahr");
    expect(alterText("", dayjs("2026-10-21"))).toBe("");
  });

  it("schreibt die Refraktion wie in der Vorlage", () => {
    expect(refraktionText({ Sph: 0.5, Cyl: -0.5, A: 180 })).toBe(
      "+0,50 sph / -0,50 cyl × 180°",
    );
    expect(refraktionText({ Sph: -1, Cyl: 0, A: 90 })).toBe("-1,00 sph");
    expect(refraktionText(undefined)).toBe("");
  });

  it("übernimmt Name, Geburtsdatum, Alter und Refraktionswerte", () => {
    const html = buildGutachtenKinderoptometriePrintHtml({ entities });
    expect(html).toContain("Mia Beispiel / 03.05.2018");
    expect(html).toContain("8 Jahre, 5 Monate");
    expect(html).toContain("+0,50 sph / -0,50 cyl × 180°");
    expect(html).toContain("+0,75 sph / -0,50 cyl × 175°");
    expect(html).toContain("Zusammenfassende Beurteilung");
  });

  it("zeigt die Eingabehinweise nur in der Vorschau", () => {
    const vorschau = buildGutachtenKinderoptometriePreviewHtml({ entities });
    expect(vorschau).toContain('contenteditable="true"');
    expect(vorschau).toContain(":empty::before");
    expect(buildGutachtenKinderoptometriePrintHtml({ entities })).not.toContain(
      ":empty::before",
    );
  });

  it("passt auf eine A4-Seite und enthält die Übersichtstabelle", () => {
    const html = buildGutachtenKinderoptometriePrintHtml({ entities });
    expect(html.match(/class="seite"/g)).toHaveLength(1);
    expect(html).toContain("<th>Bereich</th><th>Ergebnis</th><th>Status</th>");
    expect(html).toContain("keine vollständige Untersuchung");
  });

  it("druckt ohne Stempelbild einen Textstempel mit Betriebs- und IK-Nummer", () => {
    const html = buildGutachtenKinderoptometriePrintHtml({
      entities,
      bilder: {},
    });
    expect(html).toContain("stempel-text");
    expect(html).toContain(`Betriebsnr.: ${RECHNUNG_ABSENDER.betriebsnr}`);
    expect(html).toContain(`IK-Nr.: ${RECHNUNG_ABSENDER.ik}`);
    expect(html).toContain("Unterschrift –");
    expect(html).not.toContain("Inhaber</");
  });

  it("bettet hochgeladene Unterschrift und Stempel ein", () => {
    const png = "data:image/png;base64,iVBORw0KGgo=";
    const html = buildGutachtenKinderoptometriePrintHtml({
      entities,
      bilder: { stempel: png, unterschrift: png },
    });
    expect(html).toContain('class="stempel-bild"');
    expect(html).toContain('class="unterschrift-bild"');
    expect(html).not.toContain('stempel-text"');
  });
});
