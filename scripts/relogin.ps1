param([Parameter(Mandatory)][string]$Email, [Parameter(Mandatory)][string]$Deck)
$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = "ClaudeDeck sign in"

function Step($n, $text) { Write-Host ""; Write-Host "[$n] $text" -ForegroundColor Cyan }
function SaveCode {
  $answer = '{"codeOnly":true}' | & node $Deck api accounts/save - | Select-Object -Last 1 | ConvertFrom-Json
  if (-not $answer.ok) { throw $answer.error }
}

try {
  Write-Host "Sign in again as $Email" -ForegroundColor White

  Step 1 'Saving the Claude Code login you are on now, so nothing is lost'
  try { SaveCode } catch { Write-Host "    Nothing to save: $($_.Exception.Message)" -ForegroundColor DarkGray }

  Step 2 'Sign out of claude.ai in your browser first'
  Write-Host "    Your browser is still signed in to another claude.ai account and would approve that one instead."
  Write-Host "    Open claude.ai, sign out, then come back here."
  Read-Host '    Press Enter when signed out'

  Step 3 "Signing in as $Email (a browser tab opens, use that account)"
  & claude auth login --email $Email
  if ($LASTEXITCODE -ne 0) { throw 'claude auth login did not finish' }

  $status = & claude auth status --json | ConvertFrom-Json
  if ($status.email -ne $Email) {
    Write-Host ""
    Write-Host "    Signed in as $($status.email), not $Email." -ForegroundColor Yellow
    Write-Host "    Sign out of claude.ai in your browser and run this again."
    SaveCode
    Read-Host 'Press Enter to close'
    exit 1
  }

  Step 4 'Saving the fresh login in ClaudeDeck'
  SaveCode

  Write-Host ""
  Write-Host "Done. $Email works again and Claude Code is on it now." -ForegroundColor Green
} catch {
  Write-Host ""
  Write-Host "Stopped: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""
Read-Host 'Press Enter to close'
