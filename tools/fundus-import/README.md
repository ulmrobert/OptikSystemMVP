# Fundus-Import: Aufnahmen der DRSplus automatisch in UNICORN

Die Funduskamera (iCare/CenterVue DRSplus) legt jede Aufnahme selbst in
einen Netzwerkordner auf dem Praxis-PC. Dieses kleine Programm holt sie dort
ab und überträgt sie nach UNICORN:

```
DRSplus ──(Shared Folder, DICOM)──▶ C:\FundusImport\Eingang
                                        │  FundusImport.ps1 (läuft im Hintergrund)
                                        ▼
                     Edge Function fundus-import ──▶ Bucket kunde-dokumente
                                        │              + Tabelle fundus_eingang
                                        ▼
         eindeutig?  ja ─▶ beim Kunden unter Dokumente (Art „Fundusaufnahme“)
                     nein ─▶ Fundusarchiv → „Neue Aufnahmen – noch zuzuordnen“
```

**Zuordnung:** Patienten-ID an der Kamera = Kundennummer in UNICORN → sicher.
Ohne ID: Nachname + Vorname + Geburtsdatum müssen auf genau einen Kunden
passen („Hölzl“ = „HOELZL“). Widerspricht das Geburtsdatum der ID, wird
**nicht** automatisch zugeordnet.

**Tipp für die Praxis:** Beim Anlegen des Patienten an der Kamera die
**Kundennummer als Patienten-ID** eintragen.

## Einmalig einrichten

### 1. Supabase (Inhaber bzw. wer die Datenbank betreut)

1. Migration `20261124120000_fundus_eingang.sql` einspielen (läuft über den
   normalen Ablauf dev → main).
2. Zufälligen Schlüssel erzeugen (mind. 32 Zeichen, kryptografisch sicher)
   und in die Zwischenablage legen, in PowerShell:
   `$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); Set-Clipboard ([Convert]::ToBase64String($b))`
   Den Schlüssel im Passwort-Manager aufbewahren; er wird in Schritt 2 auf
   dem Praxis-PC noch einmal gebraucht.
3. Secret setzen: Supabase → Projekt **Optik-System Prod**
   (`cktdtojgrxskihihmnjm`) → Edge Functions → Secrets →
   `FUNDUS_IMPORT_TOKEN` = der Schlüssel.
4. Function bereitstellen (ohne JWT-Prüfung, sie prüft den Schlüssel selbst):
   `supabase functions deploy fundus-import --project-ref cktdtojgrxskihihmnjm --no-verify-jwt`

### 2. Praxis-PC (an dem die Kamera im Netz hängt)

PowerShell **als Administrator** öffnen und ausführen:

```powershell
powershell -ExecutionPolicy Bypass -File "<Pfad>\tools\fundus-import\Einrichten.ps1"
```

Das Skript fragt Schritt für Schritt: Ordner, Adresse + Schlüssel aus Schritt 1
(wird verschlüsselt gespeichert), Windows-Benutzer `drsplus` mit Freigabe
`FundusEingang` für die Kamera und den automatischen Start bei der Anmeldung.

### 3. Kamera (Weboberfläche der DRSplus, z. B. `http://drsplus-…/app`)

Einstellungen → **Shared Folder** → neu:

| Feld | Wert |
|---|---|
| Server | Name oder IP des Praxis-PCs |
| Folder | `FundusEingang` |
| Benutzer / Passwort | `drsplus` / wie in Schritt 2 vergeben |
| Auto-Export | **an** |
| Formate | **DICOM** (Patientendaten stecken in der Datei); JPG zusätzlich schadet nicht |

Danach eine Testaufnahme machen: Sie sollte nach spätestens ~30 Sekunden in
`C:\FundusImport\Erledigt` liegen und in UNICORN beim Kunden bzw. im
Fundusarchiv auftauchen.

## Ausprobieren und Fehlersuche

```powershell
# nur lesen und anzeigen, nichts senden:
powershell -ExecutionPolicy Bypass -File FundusImport.ps1 -Probelauf
# einen Durchgang wirklich senden:
powershell -ExecutionPolicy Bypass -File FundusImport.ps1 -Einmal
# Selbsttest des DICOM-Lesers:
powershell -ExecutionPolicy Bypass -File Test-Dicom.ps1
```

* Protokoll: `C:\FundusImport\Logs\fundus-import-JJJJ-MM.log`
* Nicht verwertbare Dateien: `C:\FundusImport\Fehler` (daneben `.txt` mit dem
  Grund). Meist: Bild im DICOM unkomprimiert → an der Kamera zusätzlich JPG
  exportieren.
* Server nicht erreichbar / Schlüssel falsch: Datei bleibt im Eingang und wird
  beim nächsten Durchgang erneut gesendet; doppelte Übertragung erkennt
  UNICORN am Bildinhalt.

Die Skripte sind als UTF-8 **mit BOM** gespeichert (sonst verfälscht
Windows PowerShell 5.1 die Umlaute).
