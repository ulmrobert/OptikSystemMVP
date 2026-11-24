<#
.SYNOPSIS
  Übernimmt Fundusaufnahmen der Kamera (iCare DRSplus) automatisch in UNICORN.

.DESCRIPTION
  Die Kamera legt jede Aufnahme selbst als DICOM (und/oder JPG) in den Ordner
  "Eingang" (Netzwerkfreigabe, siehe README.md). Dieses Programm schaut alle
  paar Sekunden dort nach, liest Name, Geburtsdatum, Patienten-ID, Auge und
  Aufnahmezeit aus der DICOM-Datei und schickt das Bild an UNICORN
  (Edge Function fundus-import). UNICORN ordnet es dem Kunden zu, wenn er
  eindeutig ist; sonst erscheint es im Fundusarchiv unter
  "Neue Aufnahmen – noch zuzuordnen".

  Erfolgreich übertragene Dateien wandern nach "Erledigt\JJJJ-MM", nicht
  verwertbare nach "Fehler" (mit .txt daneben, warum). Bei Netz- oder
  Serverfehlern bleibt die Datei liegen und wird beim nächsten Durchgang
  erneut versucht.

.PARAMETER Konfig
  Pfad zur Einstellungsdatei (Standard: fundus-import.config.json neben
  diesem Skript; wird von Einrichten.ps1 angelegt).

.PARAMETER Einmal
  Nur einen Durchgang machen und beenden (zum Ausprobieren).

.PARAMETER Probelauf
  Dateien nur lesen und anzeigen, nichts senden und nichts verschieben.
#>
[CmdletBinding()]
param(
    [string]$Konfig = (Join-Path $PSScriptRoot 'fundus-import.config.json'),
    [switch]$Einmal,
    [switch]$Probelauf
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Dicom.ps1')

# --- Einstellungen ------------------------------------------------------------

if (-not (Test-Path $Konfig)) {
    throw "Einstellungsdatei fehlt: $Konfig. Bitte zuerst Einrichten.ps1 ausführen."
}
$cfg = Get-Content $Konfig -Raw -Encoding UTF8 | ConvertFrom-Json
$basis = $cfg.Ordner
$eingang = Join-Path $basis 'Eingang'
$erledigt = Join-Path $basis 'Erledigt'
$fehlerOrdner = Join-Path $basis 'Fehler'
$logOrdner = Join-Path $basis 'Logs'
foreach ($o in @($eingang, $erledigt, $fehlerOrdner, $logOrdner)) {
    if (-not (Test-Path $o)) { New-Item -ItemType Directory -Force $o | Out-Null }
}
$intervall = if ($cfg.PSObject.Properties['IntervallSekunden'] -and $cfg.IntervallSekunden) { [int]$cfg.IntervallSekunden } else { 20 }

function Get-Token {
    # Token liegt verschlüsselt (Windows-DPAPI, nur dieser Benutzer auf diesem PC)
    $sicher = ConvertTo-SecureString $cfg.TokenGeschuetzt
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sicher)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Write-Log {
    param([string]$Text)
    $zeile = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Text
    Write-Host $zeile
    if (-not $Probelauf) {
        Add-Content -Path (Join-Path $logOrdner ('fundus-import-{0}.log' -f (Get-Date -Format 'yyyy-MM'))) -Value $zeile -Encoding UTF8
    }
}

# --- Hilfen -----------------------------------------------------------------------

function Test-DateiFertig {
    # Die Kamera schreibt noch, solange die Datei jünger als 5 s ist oder
    # sich nicht exklusiv öffnen lässt.
    param([IO.FileInfo]$Datei)
    if (((Get-Date) - $Datei.LastWriteTime).TotalSeconds -lt 5) { return $false }
    try { $s = [IO.File]::Open($Datei.FullName, 'Open', 'Read', 'None'); $s.Close(); return $true }
    catch { return $false }
}

function Move-Datei {
    param([IO.FileInfo]$Datei, [string]$Ziel)
    if (-not (Test-Path $Ziel)) { New-Item -ItemType Directory -Force $Ziel | Out-Null }
    $neu = Join-Path $Ziel $Datei.Name
    if (Test-Path $neu) {
        $neu = Join-Path $Ziel ('{0}_{1}{2}' -f $Datei.BaseName, (Get-Date -Format 'HHmmssfff'), $Datei.Extension)
    }
    Move-Item -LiteralPath $Datei.FullName -Destination $neu
}

function Get-Partner {
    # Gleichnamige Datei mit anderer Endung (z. B. bild.dcm ↔ bild.jpg)
    param([IO.FileInfo]$Datei, [string[]]$Endungen)
    foreach ($e in $Endungen) {
        $p = Join-Path $Datei.DirectoryName ($Datei.BaseName + $e)
        if ((Test-Path -LiteralPath $p) -and ($p -ne $Datei.FullName)) { return Get-Item -LiteralPath $p }
    }
    return $null
}

function Send-Aufnahme {
    param([byte[]]$Bild, [hashtable]$Meta)
    $json = $Meta | ConvertTo-Json -Compress
    $metaB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
    $kopf = @{ 'x-fundus-token' = (Get-Token); 'x-fundus-meta' = $metaB64 }
    try {
        $r = Invoke-WebRequest -Uri $cfg.FunktionsUrl -Method Post -Headers $kopf -Body $Bild `
            -ContentType 'image/jpeg' -UseBasicParsing -TimeoutSec 120
        return @{ Ok = $true; Status = [int]$r.StatusCode; Antwort = ($r.Content | ConvertFrom-Json) }
    } catch [System.Net.WebException] {
        $status = 0; $text = $_.Exception.Message
        if ($_.Exception.Response) {
            $status = [int]$_.Exception.Response.StatusCode
            try {
                $leser = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
                $text = $leser.ReadToEnd(); $leser.Close()
                $text = ($text | ConvertFrom-Json).error
            } catch { }
        }
        return @{ Ok = $false; Status = $status; Antwort = $text }
    }
}

# Ob ein Fehler endgültig ist (Datei taugt nicht) oder später erneut versucht wird
function Test-Endgueltig {
    param([int]$Status)
    return ($Status -in @(400, 413, 415))
}

# --- Eine Datei verarbeiten -------------------------------------------------------

function Invoke-Datei {
    param([IO.FileInfo]$Datei)

    $bytes = [IO.File]::ReadAllBytes($Datei.FullName)
    $begleiter = @()
    $meta = @{ dateiname = $Datei.Name }
    $bild = $null

    if (Test-IstDicom $bytes) {
        try { $d = Read-DicomDatei -Bytes $bytes }
        catch { return @{ Ergebnis = 'Fehler'; Grund = "DICOM nicht lesbar: $($_.Exception.Message)" } }

        $meta.nachname = $d.Nachname
        $meta.vorname = $d.Vorname
        $meta.geburtsdatum = $d.Geburtsdatum
        $meta.patientId = $d.PatientId
        $meta.auge = $d.Auge
        $meta.aufnahme = $d.Aufnahme
        $meta.geraet = $d.Geraet

        $bild = $d.Jpeg
        $jpg = Get-Partner -Datei $Datei -Endungen @('.jpg', '.jpeg', '.JPG', '.JPEG')
        if ($jpg) {
            $begleiter += $jpg
            if (-not $bild) { $bild = [IO.File]::ReadAllBytes($jpg.FullName); $meta.dateiname = $jpg.Name }
        }
        if (-not $bild) {
            return @{ Ergebnis = 'Fehler'; Grund = "$($d.Hinweis) Bitte an der Kamera zusätzlich den JPG-Export einschalten." }
        }
    } elseif (Test-IstJpeg $bytes) {
        # JPG mit DICOM daneben wird zusammen mit der DICOM-Datei verarbeitet
        if (Get-Partner -Datei $Datei -Endungen @('.dcm', '.DCM', '')) { return @{ Ergebnis = 'Warten' } }
        $bild = $bytes
    } else {
        return @{ Ergebnis = 'Ignorieren' }
    }

    if ($Probelauf) {
        $m = $meta.Clone()
        Write-Log ("PROBE  {0}: {1}, {2}, geb. {3}, ID {4}, Auge {5}, {6}, Bild {7:N0} KB" -f
            $Datei.Name, $m.nachname, $m.vorname, $m.geburtsdatum, $m.patientId, $m.auge, $m.aufnahme, ($bild.Length / 1KB))
        return @{ Ergebnis = 'Probe' }
    }

    $r = Send-Aufnahme -Bild $bild -Meta $meta
    if ($r.Ok) {
        return @{ Ergebnis = 'Ok'; Antwort = $r.Antwort; Begleiter = $begleiter }
    }
    if (Test-Endgueltig $r.Status) {
        return @{ Ergebnis = 'Fehler'; Grund = "UNICORN hat die Aufnahme abgelehnt ($($r.Status)): $($r.Antwort)"; Begleiter = $begleiter }
    }
    return @{ Ergebnis = 'Spaeter'; Grund = "Senden fehlgeschlagen ($($r.Status)): $($r.Antwort)" }
}

# --- Hauptschleife ----------------------------------------------------------------

$gemeldet = @{} # Dateien, deren "später erneut"-Fehler schon im Log steht

function Invoke-Durchgang {
    $dateien = Get-ChildItem -LiteralPath $eingang -File -Recurse -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime
    foreach ($datei in $dateien) {
        if (-not (Test-Path -LiteralPath $datei.FullName)) { continue } # schon als Begleiter verschoben
        if (-not (Test-DateiFertig $datei)) { continue }
        try {
            $e = Invoke-Datei -Datei $datei
        } catch {
            $e = @{ Ergebnis = 'Spaeter'; Grund = $_.Exception.Message }
        }
        $monat = Join-Path $erledigt (Get-Date -Format 'yyyy-MM')
        switch ($e.Ergebnis) {
            'Ok' {
                $a = $e.Antwort
                $wie = if ($a.doppelt) { 'schon vorhanden' } elseif ($a.status -eq 'zugeordnet') { "Kunde $($a.kundeId) zugeordnet" } else { 'noch zuzuordnen' }
                Write-Log "OK     $($datei.Name): $wie (Eingang $($a.id))"
                Move-Datei $datei $monat
                foreach ($b in $e.Begleiter) { if (Test-Path -LiteralPath $b.FullName) { Move-Datei $b $monat } }
                $gemeldet.Remove($datei.FullName)
            }
            'Fehler' {
                Write-Log "FEHLER $($datei.Name): $($e.Grund)"
                Move-Datei $datei $fehlerOrdner
                foreach ($b in @($e.Begleiter)) { if ($b -and (Test-Path -LiteralPath $b.FullName)) { Move-Datei $b $fehlerOrdner } }
                Set-Content -Path (Join-Path $fehlerOrdner ($datei.Name + '.txt')) -Value $e.Grund -Encoding UTF8
            }
            'Spaeter' {
                if (-not $gemeldet.ContainsKey($datei.FullName)) {
                    Write-Log "WARTET $($datei.Name): $($e.Grund) – neuer Versuch folgt."
                    $gemeldet[$datei.FullName] = $true
                }
            }
            'Ignorieren' {
                Write-Log "UEBERSPRUNGEN $($datei.Name): weder DICOM noch JPG."
                Move-Datei $datei (Join-Path $erledigt 'Ignoriert')
            }
        }
    }
}

Write-Log "Fundus-Import gestartet. Eingang: $eingang"
do {
    try { Invoke-Durchgang } catch { Write-Log "FEHLER im Durchgang: $($_.Exception.Message)" }
    if ($Einmal -or $Probelauf) { break }
    Start-Sleep -Seconds $intervall
} while ($true)
