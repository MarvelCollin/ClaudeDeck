param(
  [string]$ConfigPath = (Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'claudedeck.config.json')
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$config = Get-Content -Raw $ConfigPath | ConvertFrom-Json
$taskName = [string]$config.taskName
if ([string]::IsNullOrWhiteSpace($taskName)) { throw 'taskName is required.' }
if ($null -eq $config.wakeToRun) { throw 'wakeToRun is required.' }
if ($null -eq $config.runWhenLocked) { throw 'runWhenLocked is required.' }
if (-not $config.schedules) { throw 'schedules is required.' }
$triggers = foreach ($schedule in @($config.schedules)) {
  $days = @($schedule.days)
  if ($days.Count -eq 0) { throw 'Schedule days are required.' }
  $timeValues = @($schedule.times)
  if ($timeValues.Count -eq 0) { throw 'Schedule times are required.' }
  foreach ($timeText in $timeValues) {
    $at = [datetime]::ParseExact([string]$timeText, 'HH:mm', [Globalization.CultureInfo]::InvariantCulture)
    New-ScheduledTaskTrigger -Weekly -DaysOfWeek $days -At $at
  }
}
$runScript = Join-Path $PSScriptRoot 'run-claude.ps1'
$resolvedConfig = (Resolve-Path $ConfigPath).Path
$actionArgs = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -ConfigPath "{1}"' -f $runScript, $resolvedConfig
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $actionArgs -WorkingDirectory $root
$settingsParams = @{
  MultipleInstances = 'IgnoreNew'
  AllowStartIfOnBatteries = $true
  DontStopIfGoingOnBatteries = $true
  StartWhenAvailable = $true
  RunOnlyIfNetworkAvailable = $true
  Hidden = $true
  ExecutionTimeLimit = (New-TimeSpan -Minutes 30)
}
if ($config.wakeToRun) { $settingsParams.WakeToRun = $true }
$settings = New-ScheduledTaskSettingsSet @settingsParams
$user = [string]$config.user
if ([string]::IsNullOrWhiteSpace($user)) { $user = "$env:USERDOMAIN\$env:USERNAME" }

if ($config.runWhenLocked) {
  $password = Read-Host "Windows password for $user" -AsSecureString
  $credential = [System.Management.Automation.PSCredential]::new($user, $password)
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $triggers -Settings $settings -User $credential.UserName -Password $credential.GetNetworkCredential().Password -RunLevel Limited -Force -ErrorAction Stop | Out-Null
} else {
  $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Force -ErrorAction Stop | Out-Null
}

Write-Output "Installed task $taskName"
