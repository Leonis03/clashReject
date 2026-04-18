$ErrorActionPreference = "Stop"

$taskName = "ProxyGuardBlockerHelper"
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if (-not $existing) {
  Write-Output "Autostart task not found."
  exit 0
}

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
Write-Output "Removed autostart task: $taskName"
