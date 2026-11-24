# Selbsttest für Dicom.ps1 ohne echte Kamera: baut DICOM-Dateien wie eine
# Funduskamera (JPEG in den Pixeldaten, Sequenz mit unbestimmter Länge,
# Umlaut im Namen) und prüft, was herausgelesen wird.
#   powershell -ExecutionPolicy Bypass -File tools\fundus-import\Test-Dicom.ps1
# Mit -Speichern <Ordner> werden die Testdateien zusätzlich abgelegt (z. B. um
# FundusImport.ps1 -Probelauf daran auszuprobieren).
param([string]$Speichern)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Dicom.ps1')
Add-Type -AssemblyName System.Drawing

$fehler = 0
function Pruefe([string]$Was, $Ist, $Soll) {
    if ("$Ist" -ceq "$Soll") { Write-Host "  ok    $Was" }
    else { Write-Host "  FALSCH $Was : '$Ist' statt '$Soll'" -ForegroundColor Red; $script:fehler++ }
}

function New-TestJpeg {
    $bmp = New-Object Drawing.Bitmap 64, 48
    $g = [Drawing.Graphics]::FromImage($bmp); $g.Clear([Drawing.Color]::DarkRed); $g.Dispose()
    $ms = New-Object IO.MemoryStream
    $bmp.Save($ms, [Drawing.Imaging.ImageFormat]::Jpeg); $bmp.Dispose()
    return $ms.ToArray()
}

function New-Dicom {
    param([bool]$Explizit, [string]$Syntax, [byte[]]$Jpeg, [string]$Name, [bool]$MitSequenz, [bool]$Fragmentiert)
    $ms = New-Object IO.MemoryStream
    $w = New-Object IO.BinaryWriter($ms)
    $latin = [Text.Encoding]::GetEncoding(28591)

    function Gerade([byte[]]$b, [byte]$fuell = 0x20) { if ($b.Length % 2) { $b + [byte[]]@($fuell) } else { $b } }
    function El($w, [int]$g, [int]$e, [string]$vr, [byte[]]$wert, [bool]$expl) {
        $w.Write([uint16]$g); $w.Write([uint16]$e)
        if ($expl) {
            $w.Write([Text.Encoding]::ASCII.GetBytes($vr))
            if ($script:DicomLangeVRs -contains $vr) { $w.Write([uint16]0); $w.Write([uint32]$wert.Length) }
            else { $w.Write([uint16]$wert.Length) }
        } else { $w.Write([uint32]$wert.Length) }
        $w.Write($wert)
    }

    $w.Write((New-Object byte[] 128)); $w.Write([Text.Encoding]::ASCII.GetBytes('DICM'))
    El $w 0x0002 0x0010 'UI' (Gerade ([Text.Encoding]::ASCII.GetBytes($Syntax)) 0) $true
    El $w 0x0008 0x0005 'CS' (Gerade ($latin.GetBytes('ISO_IR 100'))) $Explizit
    El $w 0x0008 0x0020 'DA' ($latin.GetBytes('20261124')) $Explizit
    El $w 0x0008 0x0022 'DA' ($latin.GetBytes('20261124')) $Explizit
    El $w 0x0008 0x0032 'TM' ($latin.GetBytes('143005')) $Explizit
    El $w 0x0008 0x0070 'LO' (Gerade ($latin.GetBytes('CenterVue'))) $Explizit
    if ($MitSequenz) {
        # Sequenz mit unbestimmter Länge und einem Item, das selbst ein Element enthält
        $w.Write([uint16]0x0008); $w.Write([uint16]0x1032)
        if ($Explizit) { $w.Write([Text.Encoding]::ASCII.GetBytes('SQ')); $w.Write([uint16]0) }
        $w.Write([uint32]::MaxValue)
        $w.Write([uint16]0xFFFE); $w.Write([uint16]0xE000); $w.Write([uint32]::MaxValue)
        El $w 0x0008 0x0100 'SH' (Gerade ($latin.GetBytes('FUNDUS'))) $Explizit
        $w.Write([uint16]0xFFFE); $w.Write([uint16]0xE00D); $w.Write([uint32]0)
        $w.Write([uint16]0xFFFE); $w.Write([uint16]0xE0DD); $w.Write([uint32]0)
    }
    El $w 0x0008 0x1090 'LO' (Gerade ($latin.GetBytes('DRSplus'))) $Explizit
    El $w 0x0010 0x0010 'PN' (Gerade ($latin.GetBytes($Name))) $Explizit
    El $w 0x0010 0x0020 'LO' (Gerade ($latin.GetBytes('23625'))) $Explizit
    El $w 0x0010 0x0030 'DA' ($latin.GetBytes('19720315')) $Explizit
    El $w 0x0020 0x0062 'CS' (Gerade ($latin.GetBytes('L'))) $Explizit

    # Pixeldaten gekapselt: leere Offset-Tabelle, dann Fragment(e)
    $w.Write([uint16]0x7FE0); $w.Write([uint16]0x0010)
    if ($Explizit) { $w.Write([Text.Encoding]::ASCII.GetBytes('OB')); $w.Write([uint16]0) }
    $w.Write([uint32]::MaxValue)
    $w.Write([uint16]0xFFFE); $w.Write([uint16]0xE000); $w.Write([uint32]0)
    $j = Gerade $Jpeg 0
    $teile = New-Object 'System.Collections.Generic.List[byte[]]'
    if ($Fragmentiert) {
        $h = [int]($j.Length / 4) * 2
        $a = New-Object byte[] $h; [Array]::Copy($j, 0, $a, 0, $h); $teile.Add($a)
        $b = New-Object byte[] ($j.Length - $h); [Array]::Copy($j, $h, $b, 0, $b.Length); $teile.Add($b)
    } else { $teile.Add($j) }
    foreach ($t in $teile) {
        $w.Write([uint16]0xFFFE); $w.Write([uint16]0xE000); $w.Write([uint32]$t.Length); $w.Write($t)
    }
    $w.Write([uint16]0xFFFE); $w.Write([uint16]0xE0DD); $w.Write([uint32]0)
    $w.Flush()
    return $ms.ToArray()
}

$jpeg = New-TestJpeg
$faelle = @(
    @{ Titel = 'Explicit VR, JPEG Baseline, Umlaut, Sequenz'; Explizit = $true; Syntax = '1.2.840.10008.1.2.4.50'; Seq = $true; Frag = $false; Datei = 'test_explizit.dcm' },
    @{ Titel = 'Explicit VR, JPEG in zwei Fragmenten'; Explizit = $true; Syntax = '1.2.840.10008.1.2.4.51'; Seq = $false; Frag = $true; Datei = 'test_fragmente.dcm' },
    @{ Titel = 'Implicit VR mit Sequenz (Bild nicht lesbar erwartet)'; Explizit = $false; Syntax = '1.2.840.10008.1.2'; Seq = $true; Frag = $false; Datei = 'test_implizit.dcm' }
)

foreach ($f in $faelle) {
    Write-Host $f.Titel
    $bytes = New-Dicom -Explizit $f.Explizit -Syntax $f.Syntax -Jpeg $jpeg -Name 'Hölzl^Antonia' -MitSequenz $f.Seq -Fragmentiert $f.Frag
    if ($Speichern) {
        if (-not (Test-Path $Speichern)) { New-Item -ItemType Directory -Force $Speichern | Out-Null }
        [IO.File]::WriteAllBytes((Join-Path $Speichern $f.Datei), $bytes)
    }
    $d = Read-DicomDatei -Bytes $bytes
    Pruefe 'Nachname' $d.Nachname 'Hölzl'
    Pruefe 'Vorname' $d.Vorname 'Antonia'
    Pruefe 'Geburtsdatum' $d.Geburtsdatum '1972-03-15'
    Pruefe 'Patienten-ID' $d.PatientId '23625'
    Pruefe 'Auge' $d.Auge 'L'
    Pruefe 'Aufnahme beginnt mit' $d.Aufnahme.Substring(0, 19) '2026-11-24T14:30:05'
    Pruefe 'Gerät' $d.Geraet 'CenterVue DRSplus'
    if ($f.Syntax -eq '1.2.840.10008.1.2') {
        Pruefe 'kein Bild bei unkomprimiert/implizit' ($null -eq $d.Jpeg) $true
        Pruefe 'Hinweis gesetzt' ([bool]$d.Hinweis) $true
    } else {
        Pruefe 'Bild ist JPEG' (Test-IstJpeg $d.Jpeg) $true
        Pruefe 'Bild vollständig (gleiche Länge)' ($d.Jpeg.Length - ($d.Jpeg.Length % 2)) ($jpeg.Length - ($jpeg.Length % 2))
        $img = [Drawing.Image]::FromStream((New-Object IO.MemoryStream(, $d.Jpeg)))
        Pruefe 'Bild lässt sich öffnen (Breite)' $img.Width 64
        $img.Dispose()
    }
}

Write-Host 'Keine DICOM-Datei'
try { Read-DicomDatei -Bytes $jpeg | Out-Null; Pruefe 'Fehler erwartet' 'kein Fehler' 'Fehler' }
catch { Pruefe 'Fehler bei JPG statt DICOM' 'Fehler' 'Fehler' }

Write-Host 'Datum/Zeit'
Pruefe 'ungültiges Datum' (ConvertFrom-DicomDatum '20261340') ''
Pruefe 'Zeit ohne Sekunden' ((ConvertFrom-DicomZeitpunkt '20261124' '0905').Substring(0, 19)) '2026-11-24T09:05:00'

if ($fehler) { Write-Host "$fehler Prüfung(en) fehlgeschlagen." -ForegroundColor Red; exit 1 }
Write-Host 'Alle Prüfungen bestanden.' -ForegroundColor Green
