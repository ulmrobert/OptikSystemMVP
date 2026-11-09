// Gutachten Kinderoptometrie (Kategorie "Gutachten Kinderoptometrie"),
// kompakt auf einer A4-Seite, mit Datum, Unterschrift und Betriebsstempel.
// Automatisch übernommen: Name und Geburtsdatum des Kindes, das Alter am
// Untersuchungstag, die Refraktionswerte (subjektive Testkorrektion) und der
// Visus mit Korrektur aus dem Auftrag sowie Datum, Betrieb und Bearbeiter.
// Unterschrift und Stempel kommen aus den Betriebsdaten (privat gespeicherte
// Bilder); ist kein Stempelbild hinterlegt, wird ein Textstempel mit
// Betriebsnummer und IK-Nummer gedruckt.
// Alles andere wird in der Vorschau direkt eingetippt (anklickbare Felder);
// gedruckt wird der Stand der Vorschau.
import dayjs from "dayjs";
import type {
  DocumentMergeEntities,
  MergeSource,
} from "./documentTemplateEngine";
import { RECHNUNG_ABSENDER, escapeHtml } from "./rechnungTemplate";
import { formatDatum, formatWert, text } from "./werkstattauftragTemplate";
import { mitarbeiterAnzeige } from "./mitarbeiterNamen";
import {
  type BetriebBilder,
  betriebBilder,
  bildUrl,
} from "./betriebBilderCache";

export type GutachtenKinderoptometrieDaten = {
  entities: DocumentMergeEntities;
  // Stempel/Unterschrift; ohne Angabe die privat gespeicherten Bilder
  bilder?: BetriebBilder;
};

const e = escapeHtml;

// Feld zum Eintippen in der Vorschau; `hinweis` erscheint nur am Bildschirm,
// solange das Feld leer ist
const eingabe = (wert = "", hinweis = "") =>
  `<span class="eingabe" contenteditable="true" data-hinweis="${e(hinweis)}">${e(wert)}</span>`;

// Absatz zum Eintippen (mehrzeilig)
const absatz = (wert = "", hinweis = "") =>
  `<div class="eingabe absatz" contenteditable="true" data-hinweis="${e(hinweis)}">${e(wert)}</div>`;

/** Alter am Stichtag, z. B. "8 Jahre, 5 Monate". */
export const alterText = (geburtsdatum: unknown, stichtag = dayjs()) => {
  const geburt = dayjs(text(geburtsdatum));
  if (!text(geburtsdatum) || !geburt.isValid() || geburt.isAfter(stichtag))
    return "";
  const monate = stichtag.diff(geburt, "month");
  const jahre = Math.floor(monate / 12);
  const rest = monate % 12;
  return [
    `${jahre} ${jahre === 1 ? "Jahr" : "Jahre"}`,
    rest ? `${rest} ${rest === 1 ? "Monat" : "Monate"}` : "",
  ]
    .filter(Boolean)
    .join(", ");
};

/** Refraktion als "+0,50 sph / −0,50 cyl × 180°". */
export const refraktionText = (glas: MergeSource) => {
  if (!glas) return "";
  const sph = formatWert(glas.Sph, "dioptrie");
  // Zylinder 0 bzw. leer wird weggelassen
  const cyl = Number(glas.Cyl) ? formatWert(glas.Cyl, "dioptrie") : "";
  const achse = formatWert(glas.A, "achse");
  return [
    sph ? `${sph} sph` : "",
    cyl ? `${cyl} cyl${achse ? ` × ${achse}°` : ""}` : "",
  ]
    .filter(Boolean)
    .join(" / ");
};

const UMFANG = [
  "Anamnese und Beobachtung des visuellen Verhaltens",
  "Fern- und Nahsehschärfe mit und ohne Korrektur",
  "Objektive Refraktionsorientierung und subjektive Refraktionsbestimmung ohne Zykloplegie",
  "Pupillenreaktion, Fixation, Augenstellung und Augenbeweglichkeit",
  "Nahpunkt der Konvergenz, Vergenz- und Akkommodationsprüfungen als Funktionsprüfungen",
  "Äußere Augenbeurteilung und orientierende Untersuchung des vorderen Augenabschnitts mit fokaler Beleuchtung",
];

const UEBERSICHT: [string, string][] = [
  ["Anamnese", "erhoben"],
  ["Visus", "erhoben"],
  ["Refraktion", "orientierend"],
  ["Augenstellung / Motilität", "orientierend"],
  ["Binokularsehen", "Funktionsprüfung"],
  ["Augengesundheit", "keine vollständige Untersuchung"],
  ["Weiteres Vorgehen", "empfohlen"],
];

// Textstempel (Ersatz, wenn kein Stempelbild hochgeladen ist): leicht
// gedreht, kräftiger Rahmen und unregelmäßiger Farbauftrag (SVG-Filter)
const textStempel = (a: typeof RECHNUNG_ABSENDER) => `
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <filter id="stempel-tinte" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.025" numOctaves="2" seed="7" result="flaeche" />
    <feColorMatrix in="flaeche" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.1 1.5" result="dichte" />
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="koernung" />
    <feColorMatrix in="koernung" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 2.1" result="loecher" />
    <feComposite in="SourceGraphic" in2="dichte" operator="in" result="a" />
    <feComposite in="a" in2="loecher" operator="in" />
  </filter>
</svg>
<div class="stempel-text">
  <div class="st-nr">Betriebsnr.: ${e(a.betriebsnr)} &nbsp;·&nbsp; IK-Nr.: ${e(a.ik)}</div>
  <div class="st-firma">${e(a.firma)}</div>
  <div class="st-marke">${e(a.marke)}</div>
  <div class="st-kontakt">${e(a.ort)} · Tel. ${e(a.telefon)} · ${e(a.email)}</div>
</div>`;

export const buildGutachtenKinderoptometrieBodyHtml = ({
  entities,
  bilder = betriebBilder(),
}: GutachtenKinderoptometrieDaten): string => {
  const k: Record<string, unknown> = entities.kunde ?? {};
  const brille: Record<string, unknown> = entities.brille ?? {};
  const { glasRechts: r, glasLinks: l } = entities;
  const a = RECHNUNG_ABSENDER;
  const stempel = bildUrl(bilder.stempel);
  const unterschrift = bildUrl(bilder.unterschrift);
  const untersuchung = text(brille.Datum) ? dayjs(text(brille.Datum)) : dayjs();
  const name = [k.Vorname, k.Nachname].map(text).filter(Boolean).join(" ");
  const geburt = formatDatum(k.Geburtsdatum);
  const visus = (glas: MergeSource) => formatWert(glas?.Vis, "visus");
  const bearbeiter = text(mitarbeiterAnzeige(brille.Berater)) || a.inhaber;

  const zeile = (zellen: string[]) =>
    `<tr>${zellen.map((z) => `<td>${z}</td>`).join("")}</tr>`;

  return `
<div class="seite">
  <div class="kopf">GUTACHTEN &nbsp;|&nbsp; KINDEROPTOMETRIE</div>

  <h1>Angaben zur untersuchten Person</h1>
  <table class="tabelle vierspaltig">
    ${zeile(["<b>Name / Geburtsdatum</b>", eingabe([name, geburt].filter(Boolean).join(" / ")), "<b>Alter am Untersuchungstag</b>", eingabe(alterText(k.Geburtsdatum, untersuchung))])}
    ${zeile(["<b>Begleitperson</b>", eingabe("", "z. B. Mutter, Vater"), "<b>Schule / Klasse</b>", eingabe("", "z. B. 3. Klasse")])}
    ${zeile(["<b>Vorhandene Sehhilfe</b>", eingabe("", "z. B. keine"), "<b>Untersuchungsbedingungen</b>", eingabe("", "z. B. wach, kooperativ")])}
  </table>

  <h1>Anamnese</h1>
  <div class="spalten">
    <div>
      <h2>Anlass und Beschwerden</h2>
      ${absatz("", "Beschwerden, seit wann, in welchen Situationen …")}
    </div>
    <div>
      <h2>Augen- und Gesundheitsanamnese</h2>
      ${absatz("", "Augenverletzungen/-operationen, frühere Untersuchungen, Gesundheit, Medikamente, Allergien, Familie …")}
    </div>
  </div>
  <p class="klein">Angaben beruhen auf dem Gespräch mit der Bezugsperson und dem Kind; eine unabhängige Überprüfung medizinischer Vorbefunde fand nicht statt.</p>

  <h2>Untersuchungsumfang</h2>
  <p>${UMFANG.map(e).join(" &middot; ")}.</p>
  <p><b>Nicht durchgeführt</b> wurden eine medikamentöse Pupillenerweiterung bzw. Zykloplegie, eine Spaltlampenuntersuchung, Augeninnendruckmessung, Funduskopie und bildgebende Diagnostik. Diese Verfahren gehören bei entsprechender Fragestellung in ärztliche Hände. Die nichtzykloplegische Refraktion kann bei Kindern durch die Akkommodation beeinflusst sein und ist keine abschließende Refraktionsdiagnostik.</p>

  <div class="spalten">
    <div>
      <h2>Sehschärfe</h2>
      <table class="tabelle vier">
        <tr><th>Prüfung</th><th>Rechts (OD)</th><th>Links (OS)</th><th>Beidäugig (OU)</th></tr>
        ${zeile(["Fern ohne Korrektur", eingabe(), eingabe(), eingabe()])}
        ${zeile(["Fern mit subjektiver Testkorrektion", eingabe(visus(r)), eingabe(visus(l)), eingabe()])}
        ${zeile(["Nähe ohne Korrektur (40 cm)", eingabe(), eingabe(), eingabe()])}
        ${zeile(["Nähe mit Testkorrektion", eingabe(), eingabe(), eingabe()])}
      </table>
      <div class="klein">${eingabe("Sehzeichen wurden altersgerecht und monokular mit Abdeckung präsentiert.")}</div>

      <h2>Refraktion</h2>
      <table class="tabelle drei">
        <tr><th>Messung</th><th>Rechts (OD)</th><th>Links (OS)</th></tr>
        ${zeile(["Objektive Orientierung ohne Zykloplegie", eingabe(), eingabe()])}
        ${zeile(["Subjektive Testkorrektion", eingabe(refraktionText(r)), eingabe(refraktionText(l))])}
      </table>
    </div>
    <div>
      <h2>Übersicht</h2>
      <table class="tabelle drei">
        <tr><th>Bereich</th><th>Ergebnis</th><th>Status</th></tr>
        ${UEBERSICHT.map(([bereich, status]) => zeile([e(bereich), eingabe(), eingabe(status)])).join("")}
      </table>
      <div class="klein">${eingabe("Werte stellen keine Brillenverordnung dar. Wegen fehlender Zykloplegie ist eine latente Hyperopie nicht ausgeschlossen.")}</div>
    </div>
  </div>

  <div class="spalten">
    <div>
      <h2>Pupillen, Fixation und äußere Augen</h2>
      ${absatz("", "Pupillenreaktion, Fixation, Lider, Bindehaut, Hornhaut …")}
    </div>
    <div>
      <h2>Augenstellung und Motilität</h2>
      ${absatz("", "Abdeck-/Aufdecktest, Augenbewegungen, Nystagmus …")}
    </div>
  </div>

  <h2 class="linie">Zusammenfassende Beurteilung</h2>
  ${absatz("", "Zusammenfassung der Befunde …")}
  <p>Die Befunde begründen keine definitive Diagnose. Eine nichtzykloplegische subjektive Refraktion kann bei Kindern unvollständig sein.</p>

  <h2>Empfehlungen und weiteres Vorgehen</h2>
  ${absatz("", "weitere Empfehlungen, z. B. erneute Funktionsprüfung, Beobachtung bis zum nächsten Termin …")}
  <p class="klein">(Zeitnahe reguläre augenärztliche Untersuchung zur vollständigen Beurteilung der Augen und zur kindgerechten Refraktionsbestimmung, gegebenenfalls unter Zykloplegie. Die Entscheidung über Medikamente und diagnostisches Vorgehen trifft die Augenärztin oder der Augenarzt.)</p>
  <p><b>Bei plötzlich auftretendem Schielen, anhaltenden Doppelbildern, deutlichem Sehschärfenverlust, Schmerzen, Lichtscheu, Verletzung oder auffälliger Rötung unverzüglich ärztliche Hilfe einholen.</b></p>

  <div class="fuss">
    <div class="datum">${e(a.ort)}, ${e(dayjs().format("DD.MM.YYYY"))}</div>
    <div class="unterschrift">
      <div class="bilder">${unterschrift ? `<img class="unterschrift-bild" src="${unterschrift}" alt="" />` : ""}</div>
      <div class="linie-unterschrift">Unterschrift – ${e(bearbeiter)}</div>
    </div>
    <div class="stempel">${stempel ? `<img class="stempel-bild" src="${stempel}" alt="" />` : textStempel(a)}</div>
  </div>
</div>`;
};

const STYLES = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #333; font-size: 8pt; line-height: 1.32; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .seite { position: relative; width: 210mm; height: 297mm; padding: 10mm 14mm 10mm 14mm; overflow: hidden; background: #fff; }
  .kopf { font-size: 8pt; font-weight: bold; color: #777; letter-spacing: 0.2mm; margin-bottom: 1mm; }
  h1 { color: #1f3150; font-size: 11.5pt; margin: 2.4mm 0 1.4mm; }
  h2 { color: #1f7a8c; font-size: 9pt; margin: 2.2mm 0 1mm; }
  h2.linie { border-bottom: 0.3mm solid #333; padding-bottom: 0.4mm; }
  p { margin: 0.8mm 0 1.2mm; }
  .klein { font-size: 7pt; color: #555; margin: 0.6mm 0 0; }
  .spalten { display: grid; grid-template-columns: 1fr 1fr; gap: 0 5mm; align-items: start; }
  .tabelle { width: 100%; border-collapse: collapse; margin: 0.6mm 0 0.8mm; font-size: 7.6pt; }
  .tabelle th { background: #1f3150; color: #fff; text-align: left; font-weight: bold; padding: 0.7mm 1.4mm; border: 0.2mm solid #1f3150; }
  .tabelle td { border: 0.2mm solid #444; padding: 0.5mm 1.4mm; vertical-align: middle; }
  .tabelle.vierspaltig td:nth-child(odd) { width: 21%; background: #eef2f7; }
  .tabelle.drei td:first-child { width: 36%; }
  .tabelle.vier td:first-child { width: 34%; }
  .eingabe { display: inline-block; min-width: 100%; min-height: 1.3em; outline: none; white-space: pre-wrap; }
  .eingabe.absatz { display: block; min-height: 9mm; margin: 0.4mm 0 0.8mm; }
  .fuss { position: absolute; left: 14mm; right: 14mm; bottom: 9mm; height: 30mm; }
  .datum { position: absolute; left: 0; top: 0; font-size: 8.5pt; }
  .unterschrift { position: absolute; left: 0; bottom: 0; width: 72mm; }
  .bilder { position: relative; height: 17mm; }
  .unterschrift-bild { position: absolute; left: 6mm; bottom: 1mm; max-height: 16mm; max-width: 44mm; }
  .linie-unterschrift { border-top: 0.25mm solid #333; padding-top: 0.8mm; font-size: 7.6pt; }
  .stempel { position: absolute; right: 0; bottom: 3mm; }
  .stempel-bild { display: block; max-height: 26mm; max-width: 90mm; }
  .stempel-text { transform: rotate(-3.5deg); border: 0.7mm solid #1d3f9e; border-radius: 1.5mm; color: #1d3f9e; text-align: center; padding: 1.6mm 4mm 1.4mm; min-width: 78mm; filter: url(#stempel-tinte); }
  .stempel-text .st-nr { font-size: 7.6pt; font-weight: bold; margin-bottom: 1.2mm; }
  .stempel-text .st-firma { font-size: 11pt; font-weight: bold; line-height: 1.15; }
  .stempel-text .st-marke { font-size: 8.6pt; font-weight: bold; margin-bottom: 1mm; }
  .stempel-text .st-kontakt { font-size: 7.4pt; }
`;

// nur am Bildschirm: Eingabefelder markieren und leere mit Hinweis zeigen
const BILDSCHIRM_STYLES = `
  @media screen {
    .eingabe { background: #f3f8ff; border-radius: 2px; cursor: text; }
    .eingabe:focus { background: #e3efff; }
    .eingabe:empty::before { content: attr(data-hinweis); color: #9aa8bb; font-style: italic; }
  }
`;

const html = (inhalt: string, extra: string) => `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>Gutachten Kinderoptometrie</title>
<style>
  ${STYLES}
  ${extra}
  @page { size: A4; margin: 0; }
</style>
</head>
<body>
${inhalt}
</body>
</html>`;

export const buildGutachtenKinderoptometriePrintHtml = (
  daten: GutachtenKinderoptometrieDaten,
): string => html(buildGutachtenKinderoptometrieBodyHtml(daten), "");

export const buildGutachtenKinderoptometriePreviewHtml = (
  daten: GutachtenKinderoptometrieDaten,
): string =>
  html(
    buildGutachtenKinderoptometrieBodyHtml(daten),
    `${BILDSCHIRM_STYLES}
  html { background: #eee; }
  .seite { margin: 12px auto; box-shadow: 0 1px 6px rgba(0, 0, 0, 0.2); }
  @media print { html { background: none; } .seite { margin: 0; box-shadow: none; } }`,
  );
