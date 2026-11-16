-- 2. Mahnung (Inkasso-Ankündigung): Hinweis auf Ratenzahlung und
-- SEPA-Lastschrift vor dem Schlusssatz ergänzen (Vorlage für Stufe 3 in
-- MAHNUNG_VORLAGE_NACH_STUFE, my-admin/src/FormulareDialog.tsx).
--
-- Die Ergänzung greift nur, wenn der Standardtext aus
-- 20261019100000_mahnung_briefkopf_texte.sql noch unverändert ist und den
-- Hinweis nicht schon enthält; in "Dokumentvorlagen" angepasste Texte und
-- ein erneuter Lauf bleiben unberührt.
-- Nur Vorlagen-Datensätze, keine Kundendaten.

update public.dokumentvorlage
set "Vorlagentext" = replace(
  "Vorlagentext",
  'Falls Sie den Betrag inzwischen überwiesen haben,',
  $$Wenn Sie den Betrag nicht auf einmal zahlen können, melden Sie sich bitte umgehend bei uns. Wir vereinbaren gern eine Ratenzahlung; auf Wunsch ziehen wir die Raten auch per SEPA-Lastschrift ein. Dafür benötigen wir ein ausgefülltes und vom Kontoinhaber unterschriebenes SEPA-Mandat.

Falls Sie den Betrag inzwischen überwiesen haben,$$
)
where "Kategorie" = 'Mahnung'
  and "Name" = '2. Mahnung (Inkasso-Ankündigung)'
  and "Vorlagentext" like '%Falls Sie den Betrag inzwischen überwiesen haben,%'
  and "Vorlagentext" not like '%Ratenzahlung%';
