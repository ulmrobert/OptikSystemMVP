import { useCallback, useEffect, useState } from "react";
import { useNotify } from "react-admin";
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  TextField,
  Typography,
} from "@mui/material";
import dayjs from "dayjs";
import { DOKUMENT_BUCKET } from "./kundeDokumenteSpeicher";
import {
  augeText,
  kameraPatient,
  kundeText,
  kundenSuche,
  type FundusEingang,
  type KundeTreffer,
} from "./fundusEingang";
import { namensSuchmuster } from "./suchmuster";
import { supabase } from "./utils";

/*
 * Fundusarchiv → „Neue Aufnahmen – noch zuzuordnen“: Aufnahmen der
 * Funduskamera, die UNICORN keinem Kunden eindeutig zuordnen konnte.
 * Zuordnen legt sie unter Dokumente beim Kunden ab (fundus_zuordnen).
 */

const KundenWahl = ({
  eingang,
  onWahl,
  deaktiviert,
}: {
  eingang: FundusEingang;
  onWahl: (k: KundeTreffer | null) => void;
  deaktiviert: boolean;
}) => {
  const [vorschlaege, setVorschlaege] = useState<KundeTreffer[]>([]);
  const [treffer, setTreffer] = useState<KundeTreffer[]>([]);
  const [eingabe, setEingabe] = useState("");
  const [laedt, setLaedt] = useState(false);

  // passende Kunden aus Geburtsdatum/Name/ID der Kamera
  useEffect(() => {
    let aktiv = true;
    void supabase
      .rpc("fundus_vorschlaege", { p_eingang: eingang.id })
      .then(({ data }) => {
        if (aktiv) setVorschlaege((data ?? []) as KundeTreffer[]);
      });
    return () => {
      aktiv = false;
    };
  }, [eingang.id]);

  // freie Suche: Kundennummer oder "Nachname Vorname"
  useEffect(() => {
    const suche = kundenSuche(eingabe);
    if (!suche) {
      setTreffer([]);
      return;
    }
    let aktiv = true;
    const zeit = window.setTimeout(() => {
      setLaedt(true);
      let abfrage = supabase
        .from("kunde")
        .select(
          'kunde_id:id, Nachname:"Nachname", Vorname:"Vorname", Geburtsdatum:"Geburtsdatum", KundenNummer:"KundenNummer"',
        )
        .order("Nachname")
        .limit(15);
      if ("kundennummer" in suche) {
        abfrage = abfrage.eq("KundenNummer", suche.kundennummer);
      } else {
        abfrage = abfrage.filter(
          "Nachname",
          "imatch",
          namensSuchmuster(suche.nachname),
        );
        if (suche.vorname)
          abfrage = abfrage.filter(
            "Vorname",
            "imatch",
            namensSuchmuster(suche.vorname),
          );
      }
      void abfrage.then(({ data }) => {
        if (!aktiv) return;
        setTreffer((data ?? []) as KundeTreffer[]);
        setLaedt(false);
      });
    }, 300);
    return () => {
      aktiv = false;
      window.clearTimeout(zeit);
    };
  }, [eingabe]);

  const optionen = eingabe.trim() ? treffer : vorschlaege;

  return (
    <Autocomplete<KundeTreffer>
      size="small"
      sx={{ flex: "1 1 280px", minWidth: 240 }}
      options={optionen}
      loading={laedt}
      disabled={deaktiviert}
      filterOptions={(o) => o}
      getOptionLabel={kundeText}
      isOptionEqualToValue={(a, b) => a.kunde_id === b.kunde_id}
      onInputChange={(_, v, grund) => {
        if (grund === "input") setEingabe(v);
      }}
      onChange={(_, k) => onWahl(k)}
      noOptionsText={
        eingabe.trim()
          ? "Kein Kunde gefunden"
          : "Name oder Kundennummer eintippen"
      }
      renderInput={(params) => (
        <TextField
          {...params}
          label={
            vorschlaege.length && !eingabe.trim()
              ? `Kunde wählen (${vorschlaege.length} Vorschläge)`
              : "Kunde suchen (Name oder Kd.-Nr.)"
          }
        />
      )}
    />
  );
};

const EingangZeile = ({
  eingang,
  bildUrl,
  fertig,
}: {
  eingang: FundusEingang;
  bildUrl: string | undefined;
  fertig: () => void;
}) => {
  const notify = useNotify();
  const [kunde, setKunde] = useState<KundeTreffer | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  const zuordnen = async () => {
    if (!kunde) return;
    setArbeitet(true);
    const { error } = await supabase.rpc("fundus_zuordnen", {
      p_eingang: eingang.id,
      p_kunde: kunde.kunde_id,
    });
    setArbeitet(false);
    if (error) {
      notify(`Zuordnen fehlgeschlagen: ${error.message}`, { type: "error" });
      return;
    }
    notify(`Aufnahme bei ${kundeText(kunde)} abgelegt.`, { type: "success" });
    fertig();
  };

  const verwerfen = async () => {
    if (
      !window.confirm(
        "Diese Aufnahme verwerfen? Sie wird keinem Kunden zugeordnet.",
      )
    )
      return;
    setArbeitet(true);
    const { error } = await supabase.rpc("fundus_verwerfen", {
      p_eingang: eingang.id,
    });
    setArbeitet(false);
    if (error) {
      notify(`Verwerfen fehlgeschlagen: ${error.message}`, { type: "error" });
      return;
    }
    fertig();
  };

  return (
    <Box
      sx={{
        display: "flex",
        gap: 2,
        alignItems: "center",
        flexWrap: "wrap",
        py: 1,
        borderBottom: 1,
        borderColor: "divider",
      }}
    >
      <Box
        component="a"
        href={bildUrl}
        target="_blank"
        rel="noopener"
        sx={{
          width: 96,
          height: 72,
          flex: "0 0 auto",
          bgcolor: "grey.900",
          borderRadius: 1,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {bildUrl ? (
          <Box
            component="img"
            src={bildUrl}
            alt="Fundusaufnahme"
            sx={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <CircularProgress size={18} />
        )}
      </Box>
      <Box sx={{ flex: "1 1 220px", minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {kameraPatient(eingang)}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {eingang.Aufnahme
            ? dayjs(eingang.Aufnahme).format("DD.MM.YYYY HH:mm")
            : dayjs(eingang.created_at).format("DD.MM.YYYY HH:mm")}{" "}
          <Chip size="small" label={augeText(eingang.Auge)} sx={{ ml: 0.5 }} />
        </Typography>
      </Box>
      <KundenWahl eingang={eingang} onWahl={setKunde} deaktiviert={arbeitet} />
      <Button
        variant="contained"
        size="small"
        disabled={!kunde || arbeitet}
        onClick={() => void zuordnen()}
      >
        Zuordnen
      </Button>
      <Button
        size="small"
        color="inherit"
        disabled={arbeitet}
        onClick={() => void verwerfen()}
      >
        Verwerfen
      </Button>
    </Box>
  );
};

export const FundusEingangListe = () => {
  const notify = useNotify();
  const [zeilen, setZeilen] = useState<FundusEingang[] | null>(null);
  const [bilder, setBilder] = useState<Record<string, string>>({});

  const laden = useCallback(async () => {
    const { data, error } = await supabase
      .from("fundus_eingang")
      .select(
        'id, created_at, Pfad:"Pfad", Dateiname:"Dateiname", Aufnahme:"Aufnahme", Auge:"Auge", Patient_Nachname:"Patient_Nachname", Patient_Vorname:"Patient_Vorname", Patient_Geburtsdatum:"Patient_Geburtsdatum", Patient_ID:"Patient_ID", Geraet:"Geraet"',
      )
      .eq("Status", "offen")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      notify("Neue Fundusaufnahmen konnten nicht geladen werden.", {
        type: "error",
      });
      setZeilen([]);
      return;
    }
    const liste = (data ?? []) as FundusEingang[];
    setZeilen(liste);
    if (liste.length) {
      const { data: urls } = await supabase.storage
        .from(DOKUMENT_BUCKET)
        .createSignedUrls(liste.map((z) => z.Pfad), 60 * 30);
      const neu: Record<string, string> = {};
      for (const u of urls ?? []) {
        if (u.path && u.signedUrl) neu[u.path] = u.signedUrl;
      }
      setBilder(neu);
    }
  }, [notify]);

  useEffect(() => {
    void laden();
  }, [laden]);

  if (zeilen === null) return <CircularProgress size={22} />;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Neue Aufnahmen – noch zuzuordnen
        </Typography>
        <Chip
          size="small"
          label={zeilen.length}
          color={zeilen.length ? "warning" : "default"}
        />
        <Button size="small" onClick={() => void laden()} sx={{ ml: "auto" }}>
          Aktualisieren
        </Button>
      </Box>
      {zeilen.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Alle Aufnahmen der Funduskamera sind zugeordnet.
        </Typography>
      ) : (
        zeilen.map((z) => (
          <EingangZeile
            key={z.id}
            eingang={z}
            bildUrl={bilder[z.Pfad]}
            fertig={() =>
              setZeilen((alt) => (alt ?? []).filter((x) => x.id !== z.id))
            }
          />
        ))
      )}
    </Box>
  );
};
