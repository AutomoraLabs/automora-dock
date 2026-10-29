$ErrorActionPreference='Stop'
$source=$PSScriptRoot
$programs=Join-Path $env:LOCALAPPDATA 'Programs'
$destination=[IO.Path]::GetFullPath((Join-Path $programs 'ProfileDock'))
if($destination -ne [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Programs/ProfileDock'))){throw 'Unexpected installation path.'}
if((Test-Path -LiteralPath $destination) -and -not(Test-Path -LiteralPath (Join-Path $destination 'ProfileDock.install'))){throw 'Installation folder already exists without a ProfileDock installation marker.'}
$owned=Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($destination+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) }
foreach($process in $owned){Stop-Process -Id $process.ProcessId -ErrorAction SilentlyContinue}
New-Item -ItemType Directory -Force -Path $destination | Out-Null
Get-ChildItem -LiteralPath $source | Where-Object Name -notin @('Install.ps1','Install.cmd') | ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination $destination -Recurse -Force}
'ProfileDock per-user installation' | Set-Content -LiteralPath (Join-Path $destination 'ProfileDock.install') -Encoding utf8
$shell=New-Object -ComObject WScript.Shell
$executable=Join-Path $destination 'launcher/ProfileDockLauncher.exe'
foreach($entry in @(@{path=(Join-Path ([Environment]::GetFolderPath('Programs')) 'Automora Dock.lnk');args='--manager'},@{path=(Join-Path ([Environment]::GetFolderPath('Programs')) 'Automora Dock Launcher.lnk');args=''},@{path=(Join-Path ([Environment]::GetFolderPath('Startup')) 'Automora Dock Launcher.lnk');args='--background'})){
 $link=$shell.CreateShortcut($entry.path);$manager=$entry.args -eq '--manager';$link.TargetPath=if($manager){Join-Path $destination 'launcher/AutomoraDock.exe'}else{$executable};$link.Arguments=$entry.args;$link.WorkingDirectory=Split-Path $executable -Parent;$role=if($manager){'main'}else{'launcher'};$link.IconLocation=(Join-Path $destination ('launcher/AutomoraDock-'+$role+'.ico'))+',0';$link.Save()
}
Write-Output ('Installed Automora Dock in '+$destination+'. Your library stays in LocalAppData/ProfileDock.')
Start-Process -FilePath $executable -ArgumentList '--background' -WindowStyle Hidden
Start-Process -FilePath (Join-Path $destination 'launcher/AutomoraDock.exe') -ArgumentList '--manager'
