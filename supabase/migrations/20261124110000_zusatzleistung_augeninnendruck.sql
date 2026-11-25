-- Zusatzleistung "Augeninnendruckmessung" (24,50 €) aktiv im Katalog.
-- Der alte, nie verwendete Eintrag "IOD (Augeninnendruckmessung)" (29 €,
-- inaktiv) wird dazu umbenannt; in Prod bereits so gesetzt (idempotent).
update public.zusatzleistung
set "Bezeichnung" = 'Augeninnendruckmessung',
    "Betrag" = 24.50,
    "Aktiv" = true,
    "Reihenfolge" = coalesce("Reihenfolge", 15)
where "Bezeichnung" = 'IOD (Augeninnendruckmessung)'
  and not exists (
    select 1 from public.zusatzleistung where "Bezeichnung" = 'Augeninnendruckmessung'
  );

insert into public.zusatzleistung ("Bezeichnung", "Kategorie", "Betrag", "Aktiv", "Reihenfolge")
select 'Augeninnendruckmessung', 'Diagnostik & Vorsorge', 24.50, true, 15
where not exists (
  select 1 from public.zusatzleistung where "Bezeichnung" = 'Augeninnendruckmessung'
);
