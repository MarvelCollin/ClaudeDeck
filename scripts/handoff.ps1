param(
  [Parameter(Mandatory)][string]$SessionId,
  [string]$Folder = '',
  [string]$AltFolder = '',
  [string]$Name = 'the other account'
)
$Host.UI.RawUI.WindowTitle = "Claude on $Name"

foreach ($candidate in @($Folder, $AltFolder)) {
  if ($candidate -and (Test-Path -LiteralPath $candidate)) {
    Set-Location -LiteralPath $candidate
    break
  }
}

Write-Host "Continuing your Claude Desktop session on $Name." -ForegroundColor Cyan
Write-Host "This is a copy of the conversation. The Desktop session stays as it was." -ForegroundColor DarkGray
Write-Host ""
& claude --resume $SessionId --fork-session
