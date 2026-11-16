// Telefon-Terminanfragen: listet die offenen Terminwünsche des
// KI-Telefonassistenten (Tabelle `telefon_terminanfrage`, befüllt von der
// Edge Function telefon-termin). Das Team legt daraus den Termin an
// (öffnet das Terminformular vorausgefüllt), markiert die Anfrage als
// erledigt oder lehnt sie ab. Wie Mahnungen.tsx keine eigene `Resource`,
// sondern eine Route ("/telefon-anfragen", App.tsx; Menü: MyMenu.tsx).
import dayjs from "dayjs";
import { Box, Button } from "@mui/material";
import {
  DataTable,
  DateField,
  FunctionField,
  ListBase,
  Pagination,
  RecordContextProvider,
  ReferenceField,
  Title,
  useNotify,
  useRecordContext,
  useRefresh,
  useUpdate,
} from "react-admin";
import { useNavigate } from "react-router-dom";

const TERMINDAUER_MINUTEN = 30;

const AnfrageAktionen = () => {
  const record = useRecordContext();
  const navigate = useNavigate();
  const notify = useNotify();
  const refresh = useRefresh();
  const [update, { isPending }] = useUpdate();
  if (!record) return null;

  const setzeStatus = (status: "termin_angelegt" | "abgelehnt") =>
    update(
      "telefon_terminanfrage",
      { id: record.id, data: { Status: status }, previousData: record },
      {
        onSuccess: () => {
          notify("Anfrage aktualisiert.", { type: "success" });
          refresh();
        },
        onError: () =>
          notify("Anfrage konnte nicht aktualisiert werden.", {
            type: "error",
          }),
      },
    );

  const terminAnlegen = () => {
    const start = record.Wunschtermin ? dayjs(record.Wunschtermin) : null;
    const notiz = [record.Name, record.Telefon, record.Anliegen]
      .filter(Boolean)
      .join(" · ");
    navigate("/termin/create", {
      state: {
        kunde_id: record.kunde_id ?? undefined,
        Start: start?.toISOString(),
        Ende: start?.add(TERMINDAUER_MINUTEN, "minute").toISOString(),
        Terminart: "Telefon-KI",
        Notiz: notiz,
      },
    });
  };

  return (
    <Box sx={{ display: "flex", gap: 1 }}>
      <Button size="small" variant="contained" onClick={terminAnlegen}>
        Termin anlegen
      </Button>
      <Button
        size="small"
        disabled={isPending}
        onClick={() => setzeStatus("termin_angelegt")}
      >
        Erledigt
      </Button>
      <Button
        size="small"
        color="error"
        disabled={isPending}
        onClick={() => setzeStatus("abgelehnt")}
      >
        Ablehnen
      </Button>
    </Box>
  );
};

export const TelefonAnfragenList = () => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: "1em" }}>
    <Title title="Telefon-Anfragen" />
    <ListBase
      resource="telefon_terminanfrage"
      disableSyncWithLocation
      storeKey={false}
      filter={{ Status: "neu" }}
      sort={{ field: "created_at", order: "DESC" }}
      perPage={25}
    >
      <DataTable bulkActionButtons={false}>
        <DataTable.Col source="created_at" label="Eingegangen">
          <DateField source="created_at" showTime />
        </DataTable.Col>
        <DataTable.Col source="Name" label="Name" />
        <DataTable.Col source="Telefon" label="Telefon" />
        <DataTable.Col label="Kunde">
          <ReferenceField
            source="kunde_id"
            reference="kunde"
            link="show"
            emptyText="Unbekannt"
          >
            <FunctionField
              render={(kunde) =>
                kunde
                  ? `${kunde.Vorname ?? ""} ${kunde.Nachname ?? ""}`.trim()
                  : ""
              }
            />
          </ReferenceField>
        </DataTable.Col>
        <DataTable.Col source="Wunschtermin" label="Wunschtermin">
          <DateField source="Wunschtermin" showTime emptyText="–" />
        </DataTable.Col>
        <DataTable.Col source="Anliegen" label="Anliegen" />
        <DataTable.Col label="Aktion">
          <FunctionField
            render={(record) => (
              <RecordContextProvider value={record}>
                <AnfrageAktionen />
              </RecordContextProvider>
            )}
          />
        </DataTable.Col>
      </DataTable>
      <Pagination />
    </ListBase>
  </Box>
);
