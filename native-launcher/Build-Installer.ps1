param([string]$ReleaseDirectory,[string]$CompilerPath)
$ErrorActionPreference='Stop'
$appRoot=Split-Path $PSScriptRoot -Parent
$outputRoot=Split-Path $appRoot -Parent
if(-not $ReleaseDirectory){
 $latest=Get-ChildItem -LiteralPath $outputRoot -Directory -Filter 'AutomoraDock-0.4.0-win-x64-*' | Sort-Object Name -Descending | Select-Object -First 1
 if(-not $latest){throw 'Build a release first using Build-Release.ps1.'}
 $ReleaseDirectory=$latest.FullName
}
$ReleaseDirectory=(Resolve-Path -LiteralPath $ReleaseDirectory).Path
foreach($file in @('launcher/ProfileDockLauncher.exe','launcher/AutomoraDock.exe','launcher/AutomoraDock-main.ico','launcher/AutomoraDock-launcher.ico','runtime/node.exe','dist/index.html','dev/server.mjs','dev/bootstrap.mjs','prerequisites/MicrosoftEdgeWebview2Setup.exe','SHA256.json')){if(-not(Test-Path -LiteralPath (Join-Path $ReleaseDirectory $file))){throw ('Release file missing: '+$file)}}
$base=$ReleaseDirectory.TrimEnd('\')+'\'
foreach($entry in (Get-Content -LiteralPath (Join-Path $ReleaseDirectory 'SHA256.json') -Raw | ConvertFrom-Json)){
 $file=[IO.Path]::GetFullPath((Join-Path $ReleaseDirectory $entry.path))
 if(-not $file.StartsWith($base,[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid path in release manifest.'}
 if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $entry.sha256){throw ('Release checksum failed: '+$entry.path)}
}
if(-not $CompilerPath){
 $command=Get-Command ISCC.exe -ErrorAction SilentlyContinue
 if($command){$CompilerPath=$command.Source}
 else{foreach($candidate in @("$env:LOCALAPPDATA/Programs/Inno Setup 7/ISCC.exe","$env:LOCALAPPDATA/Programs/Inno Setup 6/ISCC.exe","${env:ProgramFiles(x86)}/Inno Setup 7/ISCC.exe","${env:ProgramFiles(x86)}/Inno Setup 6/ISCC.exe","$env:ProgramFiles/Inno Setup 7/ISCC.exe","$env:ProgramFiles/Inno Setup 6/ISCC.exe")){if(Test-Path -LiteralPath $candidate){$CompilerPath=$candidate;break}}}
}
if(-not $CompilerPath -or -not(Test-Path -LiteralPath $CompilerPath)){throw 'Install Inno Setup (6.3 or newer), then rerun this script; or pass -CompilerPath pointing to ISCC.exe. No Setup.exe has been generated.'}
$installerOutput=Join-Path $outputRoot 'installers'
New-Item -ItemType Directory -Force -Path $installerOutput | Out-Null
& $CompilerPath ('/DReleaseDir='+$ReleaseDirectory) ('/DInstallerOutput='+$installerOutput) (Join-Path $PSScriptRoot 'ProfileDock.iss')
if($LASTEXITCODE -ne 0){throw 'Installer compilation failed.'}
$installer=Join-Path $installerOutput 'AutomoraDock-Setup-0.4.0-x64.exe'
if(-not(Test-Path -LiteralPath $installer)){throw 'Compiler did not produce the expected Setup.exe.'}
Get-FileHash -LiteralPath $installer -Algorithm SHA256 | Format-List
Write-Output ('Installer ready: '+$installer)
