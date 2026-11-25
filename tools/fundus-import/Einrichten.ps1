<#
.SYNOPSIS
  Richtet den Fundus-Import auf dem Praxis-PC ein (einmalig).

.DESCRIPTION
  Fragt jeden Schritt einzeln ab:
    1. Ordner anlegen (Standard C:\FundusImport mit Eingang, Erledigt, Fehler, Logs)
    2. Adresse und Zugangsschlüssel von UNICORN speichern (der Schlüssel wird
       mit Windows-DPAPI verschlüsselt, nur dieser Benutzer auf diesem PC kann
       ihn lesen)
    3. Optional: Windows-Benutzer für die Kamera und Netzwerkfreigabe
       "FundusEingang" auf den Eingang-Ordner (braucht Administratorrechte)
    4. Optional: Aufgabe in der Aufgabenplanung, die den Import bei jeder
       Anmeldung im Hintergrund startet

  Starten (Rechtsklick auf PowerShell → "Als Administrator ausführen"):
    powershell -ExecutionPolicy Bypass -File Einrichten.ps1
#>
[CmdletBinding()]
param([string]$Ordner = 'C:\FundusImport')

$ErrorActionPreference = 'Stop'
$konfig = Join-Path $PSScriptRoot 'fundus-import.config.json'

function Frage([string]$Text) {
    $a = Read-Host "$Text [j/n]"
    return $a -match '^(j|ja|y|yes)$'
}

$istAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)

Write-Host ''
Write-Host '=== UNICORN Fundus-Import einrichten ===' -ForegroundColor Cyan
Write-Host ''

# 1. Ordner -------------------------------------------------------------------------
$eingabe = Read-Host "Ordner für den Import [$Ordner]"
if ($eingabe) { $Ordner = $eingabe }
foreach ($u in @('Eingang', 'Erledigt', 'Fehler', 'Logs')) {
    New-Item -ItemType Directory -Force (Join-Path $Ordner $u) | Out-Null
}
Write-Host "Ordner angelegt: $Ordner" -ForegroundColor Green

# 2. Verbindung zu UNICORN -----------------------------------------------------------
$alt = $null
if (Test-Path $konfig) { $alt = Get-Content $konfig -Raw -Encoding UTF8 | ConvertFrom-Json }
$urlVorschlag = if ($alt -and $alt.FunktionsUrl) { $alt.FunktionsUrl } else { 'https://cktdtojgrxskihihmnjm.supabase.co/functions/v1/fundus-import' }
$url = Read-Host "Adresse der Import-Funktion [$urlVorschlag]"
if (-not $url) { $url = $urlVorschlag }

$tokenGeschuetzt = $null
if ($alt -and $alt.PSObject.Properties['TokenGeschuetzt'] -and $alt.TokenGeschuetzt -and -not (Frage 'Zugangsschlüssel neu eingeben?')) {
    $tokenGeschuetzt = $alt.TokenGeschuetzt
} else {
    $sicher = Read-Host 'Zugangsschlüssel (FUNDUS_IMPORT_TOKEN, wird nicht angezeigt)' -AsSecureString
    if ($sicher.Length -lt 32) { throw 'Der Zugangsschlüssel muss mindestens 32 Zeichen lang sein.' }
    $tokenGeschuetzt = $sicher | ConvertFrom-SecureString
}

[ordered]@{
    Ordner            = $Ordner
    FunktionsUrl      = $url
    TokenGeschuetzt   = $tokenGeschuetzt
    IntervallSekunden = 20
} | ConvertTo-Json | Set-Content -Path $konfig -Encoding UTF8
Write-Host "Einstellungen gespeichert: $konfig" -ForegroundColor Green

# 3. Freigabe für die Kamera ---------------------------------------------------------
Write-Host ''
Write-Host 'Die Kamera braucht einen Netzwerkordner, in den sie die Aufnahmen legt.'
if (Frage 'Windows-Benutzer "drsplus" und Freigabe "FundusEingang" jetzt anlegen?') {
    if (-not $istAdmin) {
        Write-Host 'Dafür bitte PowerShell als Administrator starten und das Skript erneut ausführen.' -ForegroundColor Yellow
    } else {
        $pw = Read-Host 'Passwort für den Kamera-Benutzer "drsplus" (wird nicht angezeigt)' -AsSecureString
        if (-not (Get-LocalUser -Name 'drsplus' -ErrorAction SilentlyContinue)) {
            New-LocalUser -Name 'drsplus' -Password $pw -Description 'Funduskamera DRSplus: nur Schreibzugriff auf FundusEingang' `
                -PasswordNeverExpires -UserMayNotChangePassword | Out-Null
            Write-Host 'Benutzer "drsplus" angelegt.' -ForegroundColor Green
        } else {
            Set-LocalUser -Name 'drsplus' -Password $pw
            Write-Host 'Passwort von "drsplus" geändert.' -ForegroundColor Green
        }
        $eingang = Join-Path $Ordner 'Eingang'
        $acl = Get-Acl $eingang
        $regel = New-Object Security.AccessControl.FileSystemAccessRule('drsplus', 'Modify', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $acl.AddAccessRule($regel); Set-Acl $eingang $acl
        if (-not (Get-SmbShare -Name 'FundusEingang' -ErrorAction SilentlyContinue)) {
            New-SmbShare -Name 'FundusEingang' -Path $eingang -ChangeAccess 'drsplus' | Out-Null
        }
        Write-Host "Freigabe \\$env:COMPUTERNAME\FundusEingang angelegt (nur für drsplus)." -ForegroundColor Green
    }
}

# 4. Automatisch starten -------------------------------------------------------------
Write-Host ''
if (Frage 'Import bei jeder Anmeldung automatisch im Hintergrund starten?') {
    $skript = Join-Path $PSScriptRoot 'FundusImport.ps1'
    $aktion = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$skript`""
    $ausloeser = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
    $einst = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
    Register-ScheduledTask -TaskName 'UNICORN Fundus-Import' -Action $aktion -Trigger $ausloeser -Settings $einst `
        -Description 'Übernimmt Fundusaufnahmen der DRSplus in UNICORN' -Force | Out-Null
    Start-ScheduledTask -TaskName 'UNICORN Fundus-Import'
    Write-Host 'Aufgabe "UNICORN Fundus-Import" angelegt und gestartet.' -ForegroundColor Green
}

Write-Host ''
Write-Host 'Fertig. An der Kamera unter Einstellungen → Shared Folder eintragen:' -ForegroundColor Cyan
Write-Host "  Server:      $env:COMPUTERNAME  (oder die IP-Adresse dieses PCs)"
Write-Host '  Freigabe:    FundusEingang'
Write-Host '  Benutzer:    drsplus   Passwort: wie eben vergeben'
Write-Host '  Auto-Export: an, Format DICOM (zusätzlich JPG schadet nicht)'
Write-Host "Protokoll: $(Join-Path $Ordner 'Logs')"
