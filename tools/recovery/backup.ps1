param(
    [Parameter(Mandatory=$true)][string]$Destination,
    [Parameter(Mandatory=$true)][string]$KeyFile,
    [string]$LegacyRepo,
    [string]$ExpertRepo
)
$ErrorActionPreference = 'Stop'
$Destination = [IO.Path]::GetFullPath($Destination)
$KeyFile = (Resolve-Path -LiteralPath $KeyFile).Path
if ($LegacyRepo) { $LegacyRepo = (Resolve-Path -LiteralPath $LegacyRepo).Path }
if ($ExpertRepo) { $ExpertRepo = (Resolve-Path -LiteralPath $ExpertRepo).Path }
$recoveryRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$backupRun = Join-Path $Destination (Get-Date -Format 'yyyy-MM-dd-HHmmss-fff')
New-Item -ItemType Directory -Path $backupRun | Out-Null
Push-Location $recoveryRoot
try {
    $runtimeFile = Join-Path $backupRun 'runtime.json.gz'
    $packFolder = Join-Path $backupRun 'pack'
    & node tools/recovery/recovery.mjs backup --key-file $KeyFile --out $runtimeFile
    if ($LASTEXITCODE -ne 0) { throw 'Runtime backup failed.' }
    $packArgs = @('tools/recovery/recovery.mjs', 'pack', '--input', $runtimeFile, '--out', $packFolder)
    if ($LegacyRepo) { $packArgs += @('--legacy-repo', $LegacyRepo) }
    if ($ExpertRepo) { $packArgs += @('--expert-repo', $ExpertRepo) }
    & node @packArgs
    if ($LASTEXITCODE -ne 0) { throw 'Recovery pack failed.' }
    & node tools/recovery/recovery.mjs verify-pack --input $packFolder
    if ($LASTEXITCODE -ne 0) { throw 'Recovery pack verification failed.' }
    Write-Output "Verified recovery pack: $packFolder"
} finally { Pop-Location }
