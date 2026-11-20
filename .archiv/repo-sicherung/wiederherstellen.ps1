# Windows PowerShell: im Projektordner ausführen
$Src = $PSScriptRoot
$Root = Resolve-Path (Join-Path $Src "..")
if (-not (Test-Path (Join-Path $Root "package.json"))) { $Root = Resolve-Path (Join-Path $Src "..\..") }
Set-Location $Root
if (Test-Path ".git") { Write-Host ".git existiert bereits."; exit }
$B64 = Join-Path $Src "podracer-git.tar.gz.b64.txt"
if (Test-Path $B64) {
  certutil -decode $B64 "$env:TEMP\podracer-git.tar.gz" | Out-Null
  tar -xzf "$env:TEMP\podracer-git.tar.gz"
} elseif (Test-Path (Join-Path $Src "git\objects")) {
  Copy-Item -Recurse -Force (Join-Path $Src "git") ".git"
}
git log --oneline -5
Write-Host "Fertig. Hochladen mit: git push origin B"
