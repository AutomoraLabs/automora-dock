; Build via Build-Installer.ps1 using a validated release folder.
#ifndef ReleaseDir
  #error ReleaseDir must point to a packaged ProfileDock release.
#endif
#ifndef InstallerOutput
  #define InstallerOutput AddBackslash(ReleaseDir) + "..\installers"
#endif
#define AppVersion "0.4.0"

[Setup]
AppId=ProfileDock
AppName=Automora Dock
AppVersion={#AppVersion}
VersionInfoVersion=0.4.0.0
DefaultDirName={localappdata}\Programs\Automora Dock
DefaultGroupName=Automora Dock
UsePreviousGroup=no
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
WizardStyle=modern
SetupIconFile={#ReleaseDir}\launcher\AutomoraDock-main.ico
UninstallDisplayIcon={app}\launcher\AutomoraDock-main.ico
OutputDir={#InstallerOutput}
OutputBaseFilename=AutomoraDock-Setup-{#AppVersion}-x64
Compression=lzma2
SolidCompression=yes
CloseApplications=yes
RestartApplications=no
SetupLogging=yes
AppPublisher=Automora Labs
AppPublisherURL=https://automoralabs.store/

[Tasks]
Name: "startup"; Description: "Keep the Dock ready when I sign in to Windows"; Flags: checkedonce

[Files]
Source: "{#ReleaseDir}\prerequisites\MicrosoftEdgeWebview2Setup.exe"; DestDir: "{tmp}"; Flags: dontcopy
Source: "{#ReleaseDir}\prerequisites\Prepare-Update.ps1"; DestDir: "{tmp}"; Flags: dontcopy
Source: "{#ReleaseDir}\prerequisites\Prepare-Update.ps1"; DestDir: "{app}\maintenance"; Flags: ignoreversion
Source: "{#ReleaseDir}\dist\*"; DestDir: "{app}\dist"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#ReleaseDir}\dev\*"; DestDir: "{app}\dev"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#ReleaseDir}\launcher\*"; DestDir: "{app}\launcher"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#ReleaseDir}\runtime\*"; DestDir: "{app}\runtime"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#ReleaseDir}\licenses\*"; DestDir: "{app}\licenses"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#ReleaseDir}\VERSION.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#ReleaseDir}\LICENSE"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#ReleaseDir}\THIRD_PARTY_NOTICES.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Automora Dock"; Filename: "{app}\launcher\AutomoraDock.exe"; Parameters: "--manager"; WorkingDir: "{app}\launcher"; IconFilename: "{app}\launcher\AutomoraDock-main.ico"; AppUserModelID: "ProfileDock.Manager"
Name: "{group}\Automora Dock Launcher"; Filename: "{app}\launcher\ProfileDockLauncher.exe"; WorkingDir: "{app}\launcher"; IconFilename: "{app}\launcher\AutomoraDock-launcher.ico"; AppUserModelID: "ProfileDock.Launcher"
Name: "{userdesktop}\Automora Dock"; Filename: "{app}\launcher\AutomoraDock.exe"; Parameters: "--manager"; WorkingDir: "{app}\launcher"; IconFilename: "{app}\launcher\AutomoraDock-main.ico"; AppUserModelID: "ProfileDock.Manager"
Name: "{userdesktop}\Automora Dock Launcher"; Filename: "{app}\launcher\ProfileDockLauncher.exe"; WorkingDir: "{app}\launcher"; IconFilename: "{app}\launcher\AutomoraDock-launcher.ico"; AppUserModelID: "ProfileDock.Launcher"
Name: "{userstartup}\Automora Dock Launcher"; Filename: "{app}\launcher\ProfileDockLauncher.exe"; Parameters: "--background"; WorkingDir: "{app}\launcher"; IconFilename: "{app}\launcher\AutomoraDock-launcher.ico"; AppUserModelID: "ProfileDock.Launcher"; Tasks: startup

[Run]
Filename: "{app}\launcher\ProfileDockLauncher.exe"; Parameters: "--background"; Flags: nowait; Tasks: startup
Filename: "{app}\launcher\AutomoraDock.exe"; Parameters: "--manager"; Description: "Open Automora Dock"; Flags: nowait postinstall skipifsilent
Filename: "{app}\launcher\ProfileDockLauncher.exe"; Parameters: "--pin-after-install"; Description: "Pin Launcher to taskbar (Windows confirmation)"; Flags: nowait postinstall skipifsilent

; Personal data is outside {app}. No [UninstallDelete] entry touches it.

[InstallDelete]
Type: files; Name: "{userprograms}\Automora Dock.lnk"
Type: files; Name: "{userprograms}\Automora Dock Launcher.lnk"
Type: files; Name: "{userprograms}\ProfileDock.lnk"
Type: files; Name: "{userprograms}\ProfileDock Launcher.lnk"
Type: files; Name: "{userprograms}\ProfileDock\ProfileDock.lnk"
Type: files; Name: "{userprograms}\ProfileDock\ProfileDock Launcher.lnk"
Type: files; Name: "{userdesktop}\ProfileDock.lnk"
Type: files; Name: "{userstartup}\ProfileDock Launcher.lnk"

[Code]
function UpdateReadyMemo(Space, NewLine, MemoUserInfoInfo, MemoDirInfo, MemoTypeInfo, MemoComponentsInfo, MemoGroupInfo, MemoTasksInfo: String): String;
begin
  Result := MemoDirInfo + NewLine + MemoGroupInfo + NewLine + MemoTasksInfo + NewLine + NewLine +
    'Setup will close Automora Dock and its background service. Save any unfinished edits before continuing.';
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ExitCode: Integer;
  Args: String;
begin
  if CurStep = ssInstall then begin
    ExtractTemporaryFile('Prepare-Update.ps1');
    Args := '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{tmp}\Prepare-Update.ps1') + '" -ApplicationRoot "' + ExpandConstant('{app}') + '"';
    if not Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'), Args, '', SW_HIDE, ewWaitUntilTerminated, ExitCode) then
      RaiseException('Could not prepare Automora Dock for installation. Close it and retry Setup.');
    if ExitCode <> 0 then
      RaiseException('Could not close the previous Automora Dock service. Close it and retry Setup.');
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ExitCode: Integer;
  Args: String;
begin
  if (CurUninstallStep = usUninstall) and FileExists(ExpandConstant('{app}\maintenance\Prepare-Update.ps1')) then begin
    Args := '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\maintenance\Prepare-Update.ps1') + '" -ApplicationRoot "' + ExpandConstant('{app}') + '"';
    if not Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'), Args, '', SW_HIDE, ewWaitUntilTerminated, ExitCode) then
      RaiseException('Close Automora Dock and retry uninstalling. Your saved library has not been removed.');
    if ExitCode <> 0 then
      RaiseException('Close Automora Dock and retry uninstalling. Your saved library has not been removed.');
  end;
end;

function HasWebView2: Boolean;
var
  Version: String;
  Key: String;
begin
  Key := 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';
  Result := (RegQueryStringValue(HKLM32, Key, 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0'));
  if not Result then
    Result := (RegQueryStringValue(HKCU, Key, 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0'));
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Release: Cardinal;
  ExitCode: Integer;
begin
  Result := '';
  if (not RegQueryDWordValue(HKLM32, 'SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full', 'Release', Release)) or (Release < 528040) then begin
    Result := 'Automora Dock requires Microsoft .NET Framework 4.8 or newer. Install it from Microsoft, then run Setup again.';
    exit;
  end;
  if not HasWebView2 then begin
    WizardForm.StatusLabel.Caption := 'Installing Microsoft WebView2. An internet connection is required...';
    ExtractTemporaryFile('MicrosoftEdgeWebview2Setup.exe');
    if not Exec(ExpandConstant('{tmp}\MicrosoftEdgeWebview2Setup.exe'), '/silent /install', '', SW_HIDE, ewWaitUntilTerminated, ExitCode) then begin
      Result := 'Microsoft WebView2 could not be started. Please retry Setup.';
      exit;
    end;
    if not HasWebView2 then
      Result := 'Microsoft WebView2 could not be installed. Check your internet connection, install WebView2 from Microsoft, then retry Setup.';
  end;
end;
