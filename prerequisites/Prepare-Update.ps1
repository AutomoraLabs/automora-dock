param([Parameter(Mandatory=$true)][string]$ApplicationRoot)
$ErrorActionPreference='Stop'
$dockRoot=[IO.Path]::GetFullPath($ApplicationRoot).TrimEnd('\')
if(-not(Test-Path -LiteralPath (Join-Path $dockRoot 'dev/server.mjs'))){exit 0}
$nativePaths=@((Join-Path $dockRoot 'launcher/ProfileDockLauncher.exe'),(Join-Path $dockRoot 'launcher/AutomoraDock.exe'))
$nodePath=Join-Path $dockRoot 'runtime/node.exe'
$serviceScript=(Join-Path $dockRoot 'dev/server.mjs').Replace('/','\')
# Only this installation's exact executable paths are eligible for stopping.
for($round=0;$round -lt 3;$round++){
 Get-Process -Name ProfileDockLauncher,AutomoraDock -ErrorAction SilentlyContinue | Where-Object {$_.Path -in $nativePaths} | ForEach-Object {$_.Kill();$_.WaitForExit()}
}
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {$_.ExecutablePath -eq $nodePath -and $_.CommandLine -and $_.CommandLine.Contains($serviceScript)} | ForEach-Object {
 $owned=Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
 if($owned){$owned.Kill();$owned.WaitForExit()}
}
exit 0
