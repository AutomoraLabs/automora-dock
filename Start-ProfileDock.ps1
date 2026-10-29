$ErrorActionPreference = 'Stop'
$executable = Join-Path $PSScriptRoot 'launcher/AutomoraDock.exe'
if (-not (Test-Path -LiteralPath $executable)) { throw 'Automora Dock executable is missing. Build or rebuild Automora Dock.' }
Start-Process -FilePath $executable -ArgumentList '--manager' -WorkingDirectory (Split-Path $executable -Parent)
