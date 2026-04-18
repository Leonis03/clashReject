$ErrorActionPreference = "Stop"

$taskName = "ProxyGuardBlockerHelper"
$workdir = Split-Path -Parent $MyInvocation.MyCommand.Path
$startScript = Join-Path $workdir "start-helper.ps1"
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

if (-not (Test-Path $startScript)) {
  throw "Missing start script: $startScript"
}

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`""

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew `
  -StartWhenAvailable

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Starts the Proxy Guard Blocker local helper at user logon." `
  -User $currentUser | Out-Null

Write-Output "Installed autostart task: $taskName"
Write-Output "It will run at logon for user: $currentUser"
