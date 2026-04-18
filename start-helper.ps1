$ErrorActionPreference = "Stop"

$helperPath = Join-Path $PSScriptRoot "proxy-guard-helper.ps1"
$existing = Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -eq "powershell.exe" -and
    $_.CommandLine -like "*proxy-guard-helper.ps1*"
  }

if ($existing) {
  Write-Output ("Helper already running. PID(s): {0}" -f (($existing.ProcessId | Sort-Object) -join ", "))
  exit 0
}

$process = Start-Process `
  -FilePath "powershell.exe" `
  -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $helperPath) `
  -WindowStyle Hidden `
  -PassThru

Start-Sleep -Milliseconds 800

try {
  $client = [System.Net.Sockets.TcpClient]::new()
  $connect = $client.BeginConnect("127.0.0.1", 8765, $null, $null)
  if (-not $connect.AsyncWaitHandle.WaitOne(2000)) {
    throw "Timed out while waiting for helper port 8765."
  }

  $client.EndConnect($connect)
  $client.Close()

  Write-Output "Helper started successfully on http://127.0.0.1:8765"
  Write-Output ("PID: {0}" -f $process.Id)
  exit 0
} catch {
  Write-Error ("Helper failed to start cleanly: {0}" -f $_.Exception.Message)
  throw
}
