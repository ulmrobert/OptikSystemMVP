-- Brillenkartei: Glastypen nach Häufigkeit, damit die meistverkauften
-- Gläser oben in der Auswahl im Feld "Glastyp" stehen.
--
-- Gezählt werden Aufträge (brille) mit verknüpftem Glastyp; gleiche
-- Bezeichnungen mit anderer Groß-/Kleinschreibung oder Leerzeichen zählen
-- zusammen (angezeigt wird die häufigste Schreibweise).
-- Neue View, keine Änderung an bestehenden Daten.

create or replace view public.glastyp_haeufigkeit
with (security_invoker = true) as
with glaeser as (
  select
    regexp_replace(btrim(g."Bezeichnung"), '\s+', ' ', 'g') as bezeichnung,
    br.created_at
  from public.brille br
  join public.glastyp g on g.id = br."Glastyp"
  where coalesce(btrim(g."Bezeichnung"), '') <> ''
)
select
  mode() within group (order by bezeichnung) as "Bezeichnung",
  (count(*) filter (where created_at >= now() - interval '24 months'))::int as "Anzahl",
  count(*)::int as "Gesamt",
  max(created_at) as "Zuletzt"
from glaeser
group by lower(bezeichnung);

comment on view public.glastyp_haeufigkeit is
  'Brillenkartei: Glastypen mit Anzahl der Aufträge (Anzahl = letzte 24 Monate, Gesamt = alle) für die Vorauswahl im Feld Glastyp.';

revoke all on public.glastyp_haeufigkeit from anon;
grant select on public.glastyp_haeufigkeit to authenticated;
