# DICOM lesen, so weit es der Fundus-Import braucht: Patientendaten, Auge,
# Aufnahmezeit und das JPEG-Bild aus den Pixeldaten.
#
# Unterstützt: Explicit VR Little Endian, Implicit VR Little Endian sowie
# JPEG-komprimierte Bilder (Baseline/Extended, 1.2.840.10008.1.2.4.50/.51),
# so wie sie Funduskameras üblicherweise schreiben. Andere Bildformate (z. B.
# unkomprimiert oder JPEG-lossless) kann der Browser nicht anzeigen; dafür
# nimmt FundusImport.ps1 die gleichnamige JPG-Datei, wenn die Kamera beides
# exportiert.
#
# Nur PowerShell 5.1, keine zusätzlichen Module.

Set-StrictMode -Version 2.0

$script:DicomLangeVRs = @('OB', 'OW', 'OF', 'SQ', 'UT', 'UN', 'OD', 'OL', 'UC', 'UR', 'OV', 'SV', 'UV')
$script:JpegSyntaxen = @('1.2.840.10008.1.2.4.50', '1.2.840.10008.1.2.4.51')

# Die Tags, die gelesen werden (Gruppe/Element als 8 Hex-Zeichen)
$script:DicomTags = @{
    '00080005' = 'Zeichensatz'
    '00080020' = 'StudienDatum'
    '00080030' = 'StudienZeit'
    '00080022' = 'AufnahmeDatum'
    '00080032' = 'AufnahmeZeit'
    '0008002A' = 'AufnahmeDatumZeit'
    '00080023' = 'InhaltDatum'
    '00080033' = 'InhaltZeit'
    '00080070' = 'Hersteller'
    '00081090' = 'Modell'
    '00100010' = 'PatientName'
    '00100020' = 'PatientId'
    '00100030' = 'Geburtsdatum'
    '00200060' = 'Lateralitaet'
    '00200062' = 'BildLateralitaet'
}

function Test-IstDicom {
    param([byte[]]$Bytes)
    return ($Bytes.Length -ge 132 -and
        $Bytes[128] -eq 0x44 -and $Bytes[129] -eq 0x49 -and
        $Bytes[130] -eq 0x43 -and $Bytes[131] -eq 0x4D)
}

function Test-IstJpeg {
    param([byte[]]$Bytes)
    return ($Bytes.Length -gt 3 -and $Bytes[0] -eq 0xFF -and $Bytes[1] -eq 0xD8 -and $Bytes[2] -eq 0xFF)
}

function Get-DicomText {
    param([byte[]]$Bytes, [int]$Start, [int]$Laenge, [string]$Zeichensatz)
    if ($Laenge -le 0) { return '' }
    $enc = switch -Regex ($Zeichensatz) {
        'ISO_IR 192' { [System.Text.Encoding]::UTF8; break }
        default { [System.Text.Encoding]::GetEncoding(28591) } # Latin-1 (ISO_IR 100) und ASCII
    }
    return $enc.GetString($Bytes, $Start, $Laenge).Trim([char[]]@([char]0, ' '))
}

# Liest Element-Kopf an $Pos. Gibt Hashtable mit Tag, VR, Laenge, Daten (Start
# der Werte) zurück.
function Read-DicomKopf {
    param([byte[]]$Bytes, [int]$Pos, [bool]$Explizit)
    if ($Pos + 8 -gt $Bytes.Length) { return $null }
    $gruppe = [BitConverter]::ToUInt16($Bytes, $Pos)
    $element = [BitConverter]::ToUInt16($Bytes, $Pos + 2)
    $tag = '{0:X4}{1:X4}' -f $gruppe, $element

    # Item- und Delimiter-Tags haben nie eine VR
    if ($gruppe -eq 0xFFFE) {
        return @{ Tag = $tag; VR = ''; Laenge = [BitConverter]::ToUInt32($Bytes, $Pos + 4); Daten = $Pos + 8 }
    }
    if ($Explizit) {
        $vr = [System.Text.Encoding]::ASCII.GetString($Bytes, $Pos + 4, 2)
        if ($script:DicomLangeVRs -contains $vr) {
            if ($Pos + 12 -gt $Bytes.Length) { return $null }
            return @{ Tag = $tag; VR = $vr; Laenge = [BitConverter]::ToUInt32($Bytes, $Pos + 8); Daten = $Pos + 12 }
        }
        return @{ Tag = $tag; VR = $vr; Laenge = [uint32][BitConverter]::ToUInt16($Bytes, $Pos + 6); Daten = $Pos + 8 }
    }
    return @{ Tag = $tag; VR = ''; Laenge = [BitConverter]::ToUInt32($Bytes, $Pos + 4); Daten = $Pos + 8 }
}

# Überspringt einen Wert mit unbestimmter Länge (Sequenz) und gibt die
# Position danach zurück.
function Skip-DicomUnbestimmt {
    param([byte[]]$Bytes, [int]$Pos, [bool]$Explizit)
    while ($Pos -lt $Bytes.Length) {
        $k = Read-DicomKopf -Bytes $Bytes -Pos $Pos -Explizit $Explizit
        if ($null -eq $k) { return $Bytes.Length }
        if ($k.Tag -eq 'FFFEE0DD') { return $k.Daten }          # Ende der Sequenz
        if ($k.Tag -eq 'FFFEE00D') { $Pos = $k.Daten; continue } # Ende des Items
        if ($k.Tag -eq 'FFFEE000') {
            if ($k.Laenge -eq [uint32]::MaxValue) { $Pos = $k.Daten }   # Item-Inhalt wie normale Elemente lesen
            else { $Pos = $k.Daten + [int]$k.Laenge }
            continue
        }
        if ($k.Laenge -eq [uint32]::MaxValue) { $Pos = Skip-DicomUnbestimmt -Bytes $Bytes -Pos $k.Daten -Explizit $Explizit }
        else { $Pos = $k.Daten + [int]$k.Laenge }
    }
    return $Pos
}

# Fragmente der gekapselten Pixeldaten bis zum ersten vollständigen JPEG.
function Get-DicomJpegFragmente {
    param([byte[]]$Bytes, [int]$Pos)
    $erstesItem = $true
    $teile = New-Object System.IO.MemoryStream
    while ($Pos + 8 -le $Bytes.Length) {
        $gruppe = [BitConverter]::ToUInt16($Bytes, $Pos)
        $element = [BitConverter]::ToUInt16($Bytes, $Pos + 2)
        $laenge = [int][BitConverter]::ToUInt32($Bytes, $Pos + 4)
        $Pos += 8
        if ($gruppe -ne 0xFFFE) { break }
        if ($element -eq 0xE0DD) { break } # Ende der Pixeldaten
        if ($element -ne 0xE000) { break }
        if ($erstesItem) {
            # Basic Offset Table, enthält keine Bilddaten
            $erstesItem = $false
            $Pos += $laenge
            continue
        }
        if ($Pos + $laenge -gt $Bytes.Length) { break }
        $teile.Write($Bytes, $Pos, $laenge)
        $Pos += $laenge
        # erstes Bild vollständig, wenn es mit FFD9 endet (evtl. mit Füllbyte 00)
        $daten = $teile.GetBuffer()
        $n = [int]$teile.Length
        if (($n -ge 2 -and $daten[$n - 2] -eq 0xFF -and $daten[$n - 1] -eq 0xD9) -or
            ($n -ge 3 -and $daten[$n - 3] -eq 0xFF -and $daten[$n - 2] -eq 0xD9 -and $daten[$n - 1] -eq 0x00)) {
            break
        }
    }
    if ($teile.Length -eq 0) { return $null }
    return $teile.ToArray()
}

# DICOM-Datum (JJJJMMTT) → JJJJ-MM-TT oder $null
function ConvertFrom-DicomDatum {
    param([string]$Wert)
    if ($Wert -match '^(\d{4})(\d{2})(\d{2})$') {
        $d = [datetime]::MinValue
        if ([datetime]::TryParseExact($Wert, 'yyyyMMdd', [Globalization.CultureInfo]::InvariantCulture, 'None', [ref]$d)) {
            return $d.ToString('yyyy-MM-dd')
        }
    }
    return $null
}

# Datum + Zeit (HHMMSS[.ffffff]) → ISO-Zeitpunkt mit Ortszeit-Versatz oder $null
function ConvertFrom-DicomZeitpunkt {
    param([string]$Datum, [string]$Zeit)
    $tag = ConvertFrom-DicomDatum $Datum
    if (-not $tag) { return $null }
    $h = 0; $m = 0; $s = 0
    if ($Zeit -match '^(\d{2})(\d{2})?(\d{2})?') {
        $h = [int]$Matches[1]
        if ($Matches[2]) { $m = [int]$Matches[2] }
        if ($Matches[3]) { $s = [int]$Matches[3] }
    }
    if ($h -gt 23 -or $m -gt 59 -or $s -gt 59) { return $null }
    $lokal = [datetime]::ParseExact($tag, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture).AddHours($h).AddMinutes($m).AddSeconds($s)
    return ([datetimeoffset]$lokal).ToString('yyyy-MM-ddTHH:mm:sszzz')
}

<#
  Liest eine DICOM-Datei. Ergebnis (PSCustomObject):
    Nachname, Vorname, Geburtsdatum (JJJJ-MM-TT), PatientId, Auge (R/L),
    Aufnahme (ISO), Geraet, TransferSyntax, Jpeg (byte[] oder $null),
    Hinweis (warum kein Bild, sonst $null)
#>
function Read-DicomDatei {
    param([Parameter(Mandatory)][byte[]]$Bytes)
    if (-not (Test-IstDicom $Bytes)) { throw 'Keine DICOM-Datei (DICM-Kennung fehlt).' }

    $werte = @{}
    $pos = 132
    $syntax = ''

    # Dateikopf (Gruppe 0002) ist immer Explicit VR Little Endian
    while ($pos -lt $Bytes.Length) {
        $k = Read-DicomKopf -Bytes $Bytes -Pos $pos -Explizit $true
        if ($null -eq $k -or -not $k.Tag.StartsWith('0002')) { break }
        if ($k.Tag -eq '00020010') {
            $syntax = [System.Text.Encoding]::ASCII.GetString($Bytes, $k.Daten, [int]$k.Laenge).Trim([char[]]@([char]0, ' '))
        }
        $pos = $k.Daten + [int]$k.Laenge
    }

    if ($syntax -eq '1.2.840.10008.1.2.2') { throw 'DICOM in Big Endian wird nicht unterstützt.' }
    $explizit = ($syntax -ne '1.2.840.10008.1.2')
    $jpeg = $null
    $hinweis = $null

    while ($pos -lt $Bytes.Length) {
        $k = Read-DicomKopf -Bytes $Bytes -Pos $pos -Explizit $explizit
        if ($null -eq $k) { break }

        if ($k.Tag -eq '7FE00010') {
            if ($k.Laenge -eq [uint32]::MaxValue) {
                if ($script:JpegSyntaxen -contains $syntax) {
                    $jpeg = Get-DicomJpegFragmente -Bytes $Bytes -Pos $k.Daten
                    if ($null -eq $jpeg -or -not (Test-IstJpeg $jpeg)) {
                        $jpeg = $null
                        $hinweis = 'JPEG in der DICOM-Datei ist nicht lesbar.'
                    }
                } else {
                    $hinweis = "Bildformat $syntax kann nicht direkt angezeigt werden."
                }
            } else {
                $hinweis = 'Bild ist unkomprimiert gespeichert und kann nicht direkt angezeigt werden.'
            }
            break
        }

        $name = $script:DicomTags[$k.Tag]
        if ($name -and $k.Laenge -ne [uint32]::MaxValue -and $k.Daten + [int]$k.Laenge -le $Bytes.Length) {
            $zs = if ($werte.ContainsKey('Zeichensatz')) { $werte['Zeichensatz'] } else { '' }
            $werte[$name] = Get-DicomText -Bytes $Bytes -Start $k.Daten -Laenge ([int]$k.Laenge) -Zeichensatz $zs
        }

        if ($k.Laenge -eq [uint32]::MaxValue) {
            $pos = Skip-DicomUnbestimmt -Bytes $Bytes -Pos $k.Daten -Explizit $explizit
        } else {
            $pos = $k.Daten + [int]$k.Laenge
        }
    }

    # Name "Nachname^Vorname^Zweitname^Präfix^Suffix"
    $nachname = $null; $vorname = $null
    if ($werte['PatientName']) {
        $teile = ($werte['PatientName'] -split '=')[0] -split '\^'
        $nachname = $teile[0].Trim()
        if ($teile.Length -gt 1) { $vorname = (($teile[1..([Math]::Min(2, $teile.Length - 1))] | Where-Object { $_ }) -join ' ').Trim() }
        if (-not $nachname) { $nachname = $null }
        if (-not $vorname) { $vorname = $null }
    }

    $auge = $null
    foreach ($l in @($werte['BildLateralitaet'], $werte['Lateralitaet'])) {
        if ($l -and $l.Trim().ToUpper() -in @('R', 'L')) { $auge = $l.Trim().ToUpper(); break }
    }

    $aufnahme = $null
    if ($werte['AufnahmeDatumZeit'] -and $werte['AufnahmeDatumZeit'] -match '^(\d{8})(\d{2,6})?') {
        $aufnahme = ConvertFrom-DicomZeitpunkt $Matches[1] $Matches[2]
    }
    if (-not $aufnahme) { $aufnahme = ConvertFrom-DicomZeitpunkt $werte['AufnahmeDatum'] $werte['AufnahmeZeit'] }
    if (-not $aufnahme) { $aufnahme = ConvertFrom-DicomZeitpunkt $werte['InhaltDatum'] $werte['InhaltZeit'] }
    if (-not $aufnahme) { $aufnahme = ConvertFrom-DicomZeitpunkt $werte['StudienDatum'] $werte['StudienZeit'] }

    $geraet = (@($werte['Hersteller'], $werte['Modell']) | Where-Object { $_ }) -join ' '
    if (-not $geraet) { $geraet = $null }

    # nicht $pid nennen: $PID ist in PowerShell schreibgeschützt
    $patId = $werte['PatientId']
    if (-not $patId) { $patId = $null }

    return [pscustomobject]@{
        Nachname       = $nachname
        Vorname        = $vorname
        Geburtsdatum   = ConvertFrom-DicomDatum $werte['Geburtsdatum']
        PatientId      = $patId
        Auge           = $auge
        Aufnahme       = $aufnahme
        Geraet         = $geraet
        TransferSyntax = $syntax
        Jpeg           = $jpeg
        Hinweis        = $hinweis
    }
}
