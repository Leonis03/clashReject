$ErrorActionPreference = "Stop"

$targets = Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -eq "powershell.exe" -and
    $_.CommandLine -like "*proxy-guard-helper.ps1*"
  }

if (-not $targets) {
  Write-Output "No helper process found."
  exit 0
}

$targets | ForEach-Object {
  Stop-Process -Id $_.ProcessId -Force
}

Write-Output ("Stopped helper PID(s): {0}" -f (($targets.ProcessId | Sort-Object) -join ", "))
