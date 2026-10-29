param([string]$CacheDirectory = (Join-Path $env:LOCALAPPDATA 'ProfileDock/build-cache/webview2-1.0.4191.47'))
$ErrorActionPreference = 'Stop'
$appRoot = Split-Path $PSScriptRoot -Parent
$sdkVersion = '1.0.4191.47'
if (-not (Test-Path -LiteralPath (Join-Path $CacheDirectory 'lib/net462/Microsoft.Web.WebView2.Core.dll'))) {
    New-Item -ItemType Directory -Force -Path $CacheDirectory | Out-Null
    $packageFile = Join-Path $CacheDirectory 'webview2.nupkg'
    Invoke-WebRequest -Uri "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$sdkVersion/microsoft.web.webview2.$sdkVersion.nupkg" -OutFile $packageFile
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($packageFile, $CacheDirectory)
}
$outputDirectory = Join-Path $appRoot 'launcher'
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
Copy-Item -LiteralPath (Join-Path $CacheDirectory 'lib/net462/Microsoft.Web.WebView2.Core.dll') -Destination $outputDirectory
Copy-Item -LiteralPath (Join-Path $CacheDirectory 'lib/net462/Microsoft.Web.WebView2.WinForms.dll') -Destination $outputDirectory
Copy-Item -LiteralPath (Join-Path $CacheDirectory 'runtimes/win-x64/native/WebView2Loader.dll') -Destination $outputDirectory
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$arguments = @('/nologo', '/target:winexe', '/platform:x64', '/optimize+', ('/out:' + (Join-Path $outputDirectory 'ProfileDockLauncher.exe')), ('/win32icon:' + (Join-Path $appRoot 'launcher/AutomoraDock-launcher.ico')), ('/win32manifest:' + (Join-Path $PSScriptRoot 'launcher.manifest')), '/r:System.dll', '/r:System.Core.dll', '/r:System.Drawing.dll', '/r:System.Windows.Forms.dll', '/r:System.Net.Http.dll', ('/r:' + (Join-Path $outputDirectory 'Microsoft.Web.WebView2.Core.dll')), ('/r:' + (Join-Path $outputDirectory 'Microsoft.Web.WebView2.WinForms.dll')), (Join-Path $PSScriptRoot 'Launcher.cs'))
$arguments += '/r:System.Web.Extensions.dll'
$arguments += (Join-Path $PSScriptRoot 'FolderFavorites.cs')
$arguments += (Join-Path $PSScriptRoot 'Manager.cs')
$arguments += (Join-Path $PSScriptRoot 'TaskbarPin.cs')
$arguments += (Join-Path $PSScriptRoot 'StartupTiming.cs')
& $compiler @arguments
if ($LASTEXITCODE -ne 0) { throw 'Launcher compilation failed.' }
Set-Content -Encoding UTF8 -LiteralPath (Join-Path $outputDirectory 'ProfileDockLauncher.exe.config') -Value '<?xml version="1.0" encoding="utf-8"?><configuration><startup><supportedRuntime version="v4.0" sku=".NETFramework,Version=v4.8"/></startup></configuration>'
$mainArguments = $arguments | ForEach-Object { if($_ -like '/out:*'){ '/out:' + (Join-Path $outputDirectory 'AutomoraDock.exe') } elseif($_ -like '/win32icon:*'){ '/win32icon:' + (Join-Path $outputDirectory 'AutomoraDock-main.ico') } else { $_ } }
& $compiler @mainArguments
if ($LASTEXITCODE -ne 0) { throw 'Main application compilation failed.' }
Copy-Item -LiteralPath (Join-Path $outputDirectory 'ProfileDockLauncher.exe.config') -Destination (Join-Path $outputDirectory 'AutomoraDock.exe.config')
Write-Output 'Automora Dock main app and Launcher built successfully.'
Copy-Item -LiteralPath (Join-Path $outputDirectory 'AutomoraDock-main.ico') -Destination (Join-Path $outputDirectory 'ProfileDock.ico')
