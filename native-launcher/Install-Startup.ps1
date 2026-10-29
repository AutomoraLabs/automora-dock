param([switch]$Disable,[string]$ApplicationRoot)
$ErrorActionPreference = 'Stop'
$appRoot = if($ApplicationRoot){[IO.Path]::GetFullPath($ApplicationRoot)}else{Split-Path $PSScriptRoot -Parent}
$executable = Join-Path $appRoot 'launcher/ProfileDockLauncher.exe'
$startupLink = Join-Path ([Environment]::GetFolderPath('Startup')) 'Automora Dock Launcher.lnk'
if ($Disable) {
    if (Test-Path -LiteralPath $startupLink) { Remove-Item -LiteralPath $startupLink }
    Write-Output 'Automora Dock automatic startup disabled.'
    return
}
if (-not (Test-Path -LiteralPath $executable)) { throw 'Build the launcher before installing startup.' }
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($startupLink)
$link.TargetPath = $executable
$link.Arguments = '--background'
$link.WorkingDirectory = Split-Path $executable -Parent
$link.IconLocation = (Join-Path $appRoot 'launcher/AutomoraDock-launcher.ico') + ',0'
$link.Description = 'Prepare Automora Dock quietly when you sign in to Windows'
$link.Save()
Write-Output 'Automora Dock will prepare your saved library in the background at Windows sign-in.'
