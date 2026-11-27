import { describe, expect, it } from "vitest";
import { glastypVorschlaege } from "./glastypAuswahl";

describe("glastypVorschlaege", () => {
  const haeufig = [
    { Bezeichnung: "Organic 1.5", Anzahl: 146 },
    { Bezeichnung: "Organic 1.5 - stock", Anzahl: 528 },
    { Bezeichnung: "Alt 1.5", Anzahl: 0 },
    { Bezeichnung: "Exact DS Soft E 1.5", Anzahl: 78 },
  ];

  it("häufigste zuerst, dann der Rest alphabetisch ohne Doppelte", () => {
    expect(
      glastypVorschlaege(
        haeufig,
        ["Zeta 1.6", "organic 1.5", "1.50 BlueTech", "Alt 1.5", "Zeta 1.6"],
        2,
      ),
    ).toEqual([
      "Organic 1.5 - stock",
      "Organic 1.5",
      "1.50 BlueTech",
      "Alt 1.5",
      "Zeta 1.6",
    ]);
  });

  it("ohne Häufigkeiten wie bisher alphabetisch", () => {
    expect(glastypVorschlaege([], ["b", "A", " "])).toEqual(["A", "b"]);
  });

  it("Gläser ohne Verkauf in 24 Monaten stehen nicht oben", () => {
    expect(glastypVorschlaege(haeufig, [])).toEqual([
      "Organic 1.5 - stock",
      "Organic 1.5",
      "Exact DS Soft E 1.5",
    ]);
  });
});
