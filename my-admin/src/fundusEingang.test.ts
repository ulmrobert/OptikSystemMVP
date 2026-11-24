import { describe, expect, it } from "vitest";
import {
  augeText,
  kameraPatient,
  kundeText,
  kundenSuche,
  type FundusEingang,
} from "./fundusEingang";
import { sonstigesText } from "./zusatzleistungSonstiges";

const eingang = (teil: Partial<FundusEingang> = {}): FundusEingang => ({
  id: 1,
  created_at: "2026-11-24T13:30:00Z",
  Pfad: "fundus-eingang/2026-11/x-bild.jpg",
  Dateiname: "bild.dcm",
  Aufnahme: null,
  Auge: null,
  Patient_Nachname: null,
  Patient_Vorname: null,
  Patient_Geburtsdatum: null,
  Patient_ID: null,
  Geraet: null,
  ...teil,
});

describe("kameraPatient", () => {
  it("zeigt Name, Geburtsdatum und ID", () => {
    expect(
      kameraPatient(
        eingang({
          Patient_Nachname: "Hölzl",
          Patient_Vorname: "Antonia",
          Patient_Geburtsdatum: "1972-03-15",
          Patient_ID: "23625",
        }),
      ),
    ).toBe("Hölzl, Antonia (geb. 15.03.1972, ID 23625)");
  });

  it("ohne Angaben", () => {
    expect(kameraPatient(eingang())).toBe("ohne Namen");
  });
});

describe("augeText", () => {
  it("übersetzt R/L", () => {
    expect(augeText("R")).toBe("rechts");
    expect(augeText("L")).toBe("links");
    expect(augeText(null)).toBe("Auge unbekannt");
  });
});

describe("kundeText", () => {
  it("Name, Geburtsdatum, Kundennummer", () => {
    expect(
      kundeText({
        kunde_id: 7,
        Nachname: "Hölzl",
        Vorname: "Antonia",
        Geburtsdatum: "1972-03-15T00:00:00",
        KundenNummer: "23625",
      }),
    ).toBe("Hölzl, Antonia · 15.03.1972 · Kd.-Nr. 23625");
  });
});

describe("kundenSuche", () => {
  it("Ziffern sind die Kundennummer", () => {
    expect(kundenSuche(" 23625 ")).toEqual({ kundennummer: "23625" });
  });
  it("Nachname und Vorname", () => {
    expect(kundenSuche("Hölzl, Antonia")).toEqual({
      nachname: "Hölzl",
      vorname: "Antonia",
    });
  });
  it("zu kurz", () => {
    expect(kundenSuche("H")).toBeNull();
  });
});

describe("sonstigesText (Zusatzleistung Sonstiges)", () => {
  it("behält die freie Beschreibung", () => {
    expect(sonstigesText("Sonstiges: Bügel richten ")).toBe(
      "Sonstiges: Bügel richten",
    );
  });
  it("ohne Beschreibung nur Sonstiges", () => {
    expect(sonstigesText("Sonstiges: ")).toBe("Sonstiges");
  });
});
