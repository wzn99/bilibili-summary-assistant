$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content (Join-Path $projectRoot "manifest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$releaseDir = Join-Path $projectRoot "release"
$stageDir = Join-Path $releaseDir "stage"
$zipPath = Join-Path $releaseDir ("bilibili-summary-assistant-v{0}.zip" -f $manifest.version)
$projectRootFull = [IO.Path]::GetFullPath($projectRoot).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$stageDirFull = [IO.Path]::GetFullPath($stageDir)
$zipPathFull = [IO.Path]::GetFullPath($zipPath)

if (!$stageDirFull.StartsWith($projectRootFull, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to clean a staging directory outside the project workspace."
}
if (!$zipPathFull.StartsWith($projectRootFull, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to replace a release archive outside the project workspace."
}

if (Test-Path $stageDir) { Remove-Item -LiteralPath $stageDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stageDir | Out-Null

Copy-Item -LiteralPath (Join-Path $projectRoot "manifest.json") -Destination $stageDir
Copy-Item -LiteralPath (Join-Path $projectRoot "src") -Destination $stageDir -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot "assets") -Destination $stageDir -Recurse

if (Test-Path $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
Compress-Archive -Path (Join-Path $stageDir "*") -DestinationPath $zipPath -CompressionLevel Optimal
Remove-Item -LiteralPath $stageDir -Recurse -Force

Write-Output $zipPath
