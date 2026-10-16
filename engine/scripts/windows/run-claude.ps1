param(
  [string]$ConfigPath = (Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'claudedeck.config.json')
)

$ErrorActionPreference = 'Stop'
$scriptsRoot = Split-Path -Parent $PSScriptRoot
$root = Split-Path -Parent $scriptsRoot
$node = Get-Command node -ErrorAction Stop
$runner = Join-Path $root 'dist\bin\run-claude.js'
if (-not (Test-Path $runner)) { throw "Runner not found: $runner" }
Set-Location $root
& $node.Source $runner --config $ConfigPath
$exitCode = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 1 }
exit $exitCode
