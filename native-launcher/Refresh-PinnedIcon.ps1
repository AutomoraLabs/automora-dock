param([string]$ApplicationRoot,[string]$PreviousRoot)
$ErrorActionPreference = 'Stop'
$appRoot = if($ApplicationRoot){[IO.Path]::GetFullPath($ApplicationRoot)}else{Split-Path $PSScriptRoot -Parent}
$executable = [IO.Path]::GetFullPath((Join-Path $appRoot 'launcher/ProfileDockLauncher.exe'))
$icon = Join-Path $appRoot 'launcher/ProfileDock.ico'
$previousExecutable=if($PreviousRoot){[IO.Path]::GetFullPath((Join-Path $PreviousRoot 'launcher/ProfileDockLauncher.exe'))}else{$executable}
if(-not(Test-Path -LiteralPath $executable) -or -not(Test-Path -LiteralPath $icon)){throw 'The installed ProfileDock executable or icon is missing.'}
$pinnedFolder = Join-Path $env:APPDATA 'Microsoft/Internet Explorer/Quick Launch/User Pinned/TaskBar'
$shell = New-Object -ComObject WScript.Shell
if (Test-Path -LiteralPath $pinnedFolder) {
    foreach ($file in Get-ChildItem -LiteralPath $pinnedFolder -Filter '*.lnk' -File) {
        $link = $shell.CreateShortcut($file.FullName)
        if ($link.TargetPath -and ([string]::Equals([IO.Path]::GetFullPath($link.TargetPath), $executable, [StringComparison]::OrdinalIgnoreCase) -or [string]::Equals([IO.Path]::GetFullPath($link.TargetPath), $previousExecutable, [StringComparison]::OrdinalIgnoreCase))) {
            $link.TargetPath=$executable
            $link.WorkingDirectory=Split-Path $executable -Parent
            $role=if($link.Arguments -match '--manager'){'main'}else{'launcher'}
            $link.IconLocation = (Join-Path $appRoot ('launcher/AutomoraDock-'+$role+'.ico')) + ',0'
            $link.Save()
            Write-Output 'Updated the pinned ProfileDock icon.'
        }
    }
}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ProfileDockIconRefresh {
 [DllImport("shell32.dll")] public static extern void SHChangeNotify(uint change,uint flags,IntPtr item1,IntPtr item2);
}
'@
[ProfileDockIconRefresh]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
