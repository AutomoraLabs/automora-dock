$ErrorActionPreference='Stop'
$destination=Join-Path (Split-Path $PSScriptRoot -Parent) 'prerequisites/MicrosoftEdgeWebview2Setup.exe'
$downloaded=$false
if(-not(Test-Path -LiteralPath $destination)){
    [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -UseBasicParsing -Uri 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $destination
    $downloaded=$true
}
$signature=Get-AuthenticodeSignature -LiteralPath $destination
if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation'){
    if($downloaded){Remove-Item -LiteralPath $destination -Force}
    throw 'WebView2 bootstrapper must have a valid Microsoft Corporation signature.'
}
Write-Output 'Microsoft-signed WebView2 bootstrapper is ready.'
