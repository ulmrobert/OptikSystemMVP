-- Vierte Mahnstufe: "Letzte Mahnung (Mahngebühr)" mit pauschaler Mahngebühr
-- ({{mahnung.gebuehr}}, MAHNGEBUEHR in my-admin/src/mahnungTemplate.ts) und
-- Gesamtbetrag ({{mahnung.gesamt}}). Passend dazu Stufe 4 in
-- MAHNUNG_VORLAGE_NACH_STUFE (my-admin/src/FormulareDialog.tsx).
-- Mahnstufe 0 = keine Mahnung, 1..4 = Zahlungserinnerung bis letzte Mahnung.
-- Nur Vorlagen-Datensatz, keine Kundendaten.

alter table public.brille
  drop constraint if exists brille_mahnstufe_check;
alter table public.brille
  add constraint brille_mahnstufe_check check ("Mahnstufe" between 0 and 4);

comment on column public.brille."Mahnstufe" is
  'Mahnstufe des Auftrags (0 = keine Mahnung, 1/2/3/4 = Zahlungserinnerung, 1. Mahnung, 2. Mahnung, letzte Mahnung). Wird ausschließlich über increment_mahnstufe() hochgezählt, Issue #57.';

create or replace function public.increment_mahnstufe(p_brille_id bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_neue_mahnstufe integer;
begin
  update public.brille
  set "Mahnstufe" = least("Mahnstufe" + 1, 4)
  where id = p_brille_id
  returning "Mahnstufe" into v_neue_mahnstufe;

  if v_neue_mahnstufe is null then
    raise exception 'Auftrag % nicht gefunden', p_brille_id;
  end if;

  return v_neue_mahnstufe;
end;
$$;

comment on function public.increment_mahnstufe(bigint) is
  'Zählt beim Erstellen einer Mahnung die Mahnstufe eines Auftrags um 1 hoch (max. 4) und gibt die neue Stufe zurück, Issue #57.';

insert into public.dokumentvorlage ("Name", "Kategorie", "Vorlagentext", "Aktiv")
select 'Letzte Mahnung (Mahngebühr)', 'Mahnung', $$Letzte Mahnung

{{kunde.briefanrede}},

trotz mehrfacher Zahlungsaufforderung liegt uns für die Rechnung {{rechnung.nummer}} vom {{rechnung.datum}} noch immer kein Zahlungseingang vor.

Offener Rechnungsbetrag: {{mahnung.betrag}} €
Mahngebühr: {{mahnung.gebuehr}} €
Gesamtbetrag: {{mahnung.gesamt}} €

Wir fordern Sie auf, den Gesamtbetrag bis spätestens {{mahnung.frist}} auf das unten angegebene Konto zu überweisen. Bitte geben Sie dabei die Rechnungsnummer als Verwendungszweck an.

Wenn Sie den Betrag nicht auf einmal zahlen können, melden Sie sich bitte umgehend bei uns. Wir vereinbaren gern eine Ratenzahlung; auf Wunsch ziehen wir die Raten auch per SEPA-Lastschrift ein.

Geht die Zahlung nicht fristgerecht ein, übergeben wir die Forderung ohne weitere Ankündigung an ein Inkassobüro oder leiten das gerichtliche Mahnverfahren ein. Die dadurch entstehenden Kosten sowie gesetzliche Verzugszinsen gehen zu Ihren Lasten.

Falls Sie den Betrag inzwischen überwiesen haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.

Mit freundlichen Grüßen
{{betrieb.name}}
{{betrieb.kontakt}}
{{betrieb.bank}}$$, true
where not exists (
  select 1 from public.dokumentvorlage d
  where d."Kategorie" = 'Mahnung' and d."Name" = 'Letzte Mahnung (Mahngebühr)'
);
