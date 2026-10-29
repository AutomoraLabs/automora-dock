$appRoot = $PSScriptRoot
$processes = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*dev/server.mjs*' }
foreach ($entry in $processes) {
    # Stop only the process listening on ProfileDock's development port.
    $connection = Get-NetTCPConnection -LocalPort 1420 -State Listen -ErrorAction SilentlyContinue | Where-Object OwningProcess -eq $entry.ProcessId
    if ($connection) { Stop-Process -Id $entry.ProcessId }
}
