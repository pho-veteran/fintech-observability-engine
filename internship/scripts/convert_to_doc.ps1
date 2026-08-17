$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$inputPath = Join-Path $root 'internship\de-cuong-thuc-tap.docx'
$outputPath = Join-Path $root 'internship\de-cuong-thuc-tap.doc'

if (-not (Test-Path $inputPath)) {
    throw "Missing input document: $inputPath"
}

$word = $null
$document = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0 # wdAlertsNone
    $document = $word.Documents.Open($inputPath, $false, $true)
    $document.SaveAs2($outputPath, 0) # wdFormatDocument97
    Write-Output $outputPath
}
finally {
    if ($document) { $document.Close() }
    if ($word) { $word.Quit() }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
