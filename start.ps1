$ErrorActionPreference = 'Stop'
$cargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
if (Test-Path -LiteralPath $cargoBin) {
    $env:Path = "$cargoBin;$env:Path"
}
Push-Location $PSScriptRoot
try {
    & npm.cmd run tauri dev
    if ($LASTEXITCODE -ne 0) { throw "Tauri exited with code $LASTEXITCODE" }
} finally {
    Pop-Location
}
