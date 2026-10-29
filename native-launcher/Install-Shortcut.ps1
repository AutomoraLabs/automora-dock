param([string]$ApplicationRoot)
$ErrorActionPreference = 'Stop'
$appRoot = if($ApplicationRoot){[IO.Path]::GetFullPath($ApplicationRoot)}else{Split-Path $PSScriptRoot -Parent}
$executable = Join-Path $appRoot 'launcher/ProfileDockLauncher.exe'
if (-not (Test-Path -LiteralPath $executable)) { throw 'Build the native launcher first.' }
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
public static class ProfileDockShortcut
{
 [ComImport,Guid("00021401-0000-0000-C000-000000000046")] class ShellLink {}
 [StructLayout(LayoutKind.Sequential)] struct PropertyKey { public Guid Format; public uint Id; }
 [StructLayout(LayoutKind.Explicit,Size=24)] struct PropVariant { [FieldOffset(0)] public ushort Type; [FieldOffset(8)] public IntPtr Text; }
 [ComImport,Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IPropertyStore
 {
  [PreserveSig] int GetCount(out uint count);
  [PreserveSig] int GetAt(uint index,out PropertyKey key);
  [PreserveSig] int GetValue(ref PropertyKey key,out PropVariant value);
  [PreserveSig] int SetValue(ref PropertyKey key,ref PropVariant value);
  [PreserveSig] int Commit();
 }
 public static void SetAppId(string path)
 { SetAppId(path,"ProfileDock.Launcher"); }
 public static void SetAppId(string path,string appId)
 {
  object link=new ShellLink();
  var value=new PropVariant { Type=31, Text=Marshal.StringToCoTaskMemUni(appId) };
  try {
   var file=(IPersistFile)link; file.Load(path,2);
   var store=(IPropertyStore)link;
   var key=new PropertyKey { Format=new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), Id=5 };
   Marshal.ThrowExceptionForHR(store.SetValue(ref key,ref value));
   Marshal.ThrowExceptionForHR(store.Commit());file.Save(path,true);
  } finally { Marshal.FreeCoTaskMem(value.Text);Marshal.FinalReleaseComObject(link); }
 }
}
'@

$shell = New-Object -ComObject WScript.Shell
$mainExecutable = Join-Path $appRoot 'launcher/AutomoraDock.exe'
function Set-DockShortcut($path,$manager,$startup) {
    $link=$shell.CreateShortcut($path)
    $link.TargetPath=if($manager){$mainExecutable}else{$executable}
    $link.Arguments=if($manager){'--manager'}elseif($startup){'--background'}else{''}
    $link.WorkingDirectory=Split-Path $executable -Parent
    $role=if($manager){'main'}else{'launcher'}
    $link.IconLocation=(Join-Path $appRoot ('launcher/AutomoraDock-'+$role+'.ico'))+',0'
    $link.Description=if($manager){'Automora Dock main library'}else{'Your pinned library, one click from the taskbar'}
    $link.Save()
    $id=if($manager){'ProfileDock.Manager'}else{'ProfileDock.Launcher'}
    [ProfileDockShortcut]::SetAppId($path,$id)
}
$startMenu=[Environment]::GetFolderPath('Programs')
foreach($folder in @($appRoot,$startMenu)){
    Set-DockShortcut (Join-Path $folder 'Automora Dock.lnk') $true $false
    Set-DockShortcut (Join-Path $folder 'Automora Dock Launcher.lnk') $false $false
}
# Migrate existing shortcuts only when their target belongs to this application.
$roots=@($appRoot,(Split-Path $PSScriptRoot -Parent),(Join-Path $env:LOCALAPPDATA 'Programs/ProfileDock'),(Join-Path $env:LOCALAPPDATA 'Programs/Automora Dock'))
$known=@($roots | ForEach-Object {Join-Path $_ 'launcher/ProfileDockLauncher.exe';Join-Path $_ 'launcher/AutomoraDock.exe'})
$startupFolder=[Environment]::GetFolderPath('Startup')
$pinned=Join-Path $env:APPDATA 'Microsoft/Internet Explorer/Quick Launch/User Pinned/TaskBar'
foreach($folder in @($appRoot,$startMenu,[Environment]::GetFolderPath('Desktop'),$startupFolder,$pinned)){
    if(-not(Test-Path -LiteralPath $folder)){continue}
    foreach($file in Get-ChildItem -LiteralPath $folder -Filter '*.lnk' -File){
        $link=$shell.CreateShortcut($file.FullName)
        if($known -notcontains $link.TargetPath){continue}
        $manager=$link.Arguments -match '--manager' -or [IO.Path]::GetFileName($link.TargetPath) -eq 'AutomoraDock.exe'
        $startup=$folder -eq $startupFolder
        Set-DockShortcut $file.FullName $manager $startup
        if($file.BaseName -like 'ProfileDock*'){
            $newName=if($manager){'Automora Dock.lnk'}else{'Automora Dock Launcher.lnk'}
            $newPath=Join-Path $folder $newName
            if(Test-Path -LiteralPath $newPath){Remove-Item -LiteralPath $file.FullName}else{Rename-Item -LiteralPath $file.FullName -NewName $newName}
        }
    }
}
& (Join-Path $PSScriptRoot 'Install-Startup.ps1') -ApplicationRoot $appRoot
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class AutomoraIconRefresh { [DllImport("shell32.dll")] public static extern void SHChangeNotify(uint change,uint flags,IntPtr item1,IntPtr item2); }
'@
[AutomoraIconRefresh]::SHChangeNotify(0x08000000,0,[IntPtr]::Zero,[IntPtr]::Zero)
Write-Output 'Automora Dock shortcuts updated with separate main and Launcher icons.'
