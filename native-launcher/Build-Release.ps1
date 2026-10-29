param([string]$NodePath,[switch]$SkipBuild)
$ErrorActionPreference='Stop'
$appRoot=Split-Path $PSScriptRoot -Parent
if(-not $NodePath){$nodeCommand=Get-Command node.exe -ErrorAction SilentlyContinue;if($nodeCommand){$NodePath=$nodeCommand.Source}}
if(-not $NodePath -or -not(Test-Path -LiteralPath $NodePath)){throw 'Pass -NodePath with an installed Node.js 24 x64 executable.'}
$runtime=& $NodePath -p 'JSON.stringify({version:process.version,major:parseInt(process.versions.node),arch:process.arch})' | ConvertFrom-Json
if($runtime.major -lt 24 -or $runtime.arch -ne 'x64'){throw 'Node.js 24 or newer, Windows x64, is required.'}
if(-not $SkipBuild){Push-Location $appRoot;try{& $NodePath dev/build.mjs;if($LASTEXITCODE -ne 0){throw 'Frontend build failed.'};& $NodePath --test 'tests/*.test.mjs';if($LASTEXITCODE -ne 0){throw 'Tests failed.'};& (Join-Path $PSScriptRoot 'Build-Launcher.ps1')}finally{Pop-Location}}
& (Join-Path $PSScriptRoot 'Prepare-Prerequisites.ps1')
$output=Join-Path (Split-Path $appRoot -Parent) ('AutomoraDock-0.4.0-win-x64-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
if(Test-Path -LiteralPath $output){throw 'Release output already exists. Retry with a new output timestamp.'}
New-Item -ItemType Directory -Path $output | Out-Null
foreach($folder in @('dist','launcher','licenses','prerequisites')){Copy-Item -LiteralPath (Join-Path $appRoot $folder) -Destination $output -Recurse}
New-Item -ItemType Directory -Path (Join-Path $output 'dev'),(Join-Path $output 'runtime') | Out-Null
foreach($file in @('server.mjs','core.mjs','favorites.mjs','backup.mjs','bootstrap.mjs')){Copy-Item -LiteralPath (Join-Path $appRoot ('dev/'+$file)) -Destination (Join-Path $output 'dev')}
Copy-Item -LiteralPath $NodePath -Destination (Join-Path $output 'runtime/node.exe')
foreach($file in @('Start-ProfileDock.ps1','Start ProfileDock.cmd','Open Pinned Menu.cmd','Start Automora Dock.cmd','LICENSE','THIRD_PARTY_NOTICES.md')){Copy-Item -LiteralPath (Join-Path $appRoot $file) -Destination $output}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Install-Release.ps1') -Destination (Join-Path $output 'Install.ps1')
Copy-Item -LiteralPath (Join-Path $appRoot 'RELEASE-READINESS.md') -Destination $output
@'
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install.ps1"
pause
'@ | Set-Content -LiteralPath (Join-Path $output 'Install.cmd') -Encoding ascii
"Automora Dock 0.4.0 Windows x64`r`nRuntime: $($runtime.version)`r`nUnsigned release candidate. See RELEASE-READINESS.md." | Set-Content -LiteralPath (Join-Path $output 'VERSION.txt') -Encoding utf8
$manifest=Get-ChildItem -LiteralPath $output -Recurse -File | ForEach-Object { @{path=$_.FullName.Substring($output.Length+1);sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash;bytes=$_.Length} }
$manifest | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $output 'SHA256.json') -Encoding utf8
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($output,$output+'.zip',[IO.Compression.CompressionLevel]::Optimal,$true)
Write-Output ('Release built: '+$output+'.zip')
