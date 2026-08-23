<#
.SYNOPSIS
    Creates a portable PostgreSQL backup for TJSys ERP.
.DESCRIPTION
    Uses pg_dump custom format, whose compression is native and does not
    require gzip on Windows. Credentials are read from the environment.
#>

param(
    [string]$OutputDir = ".\backups",
    [bool]$Compress = $true,
    [switch]$Encrypt = $false,
    [string]$PgHost = $(if ($env:PGHOST) { $env:PGHOST } else { "127.0.0.1" }),
    [int]$Port = $(if ($env:PGPORT) { [int]$env:PGPORT } else { 5432 }),
    [string]$Database = $(if ($env:PGDATABASE) { $env:PGDATABASE } else { "tjsys" }),
    [string]$Username = $(if ($env:PGUSER) { $env:PGUSER } else { "tjsys_app" })
)

$ErrorActionPreference = "Stop"

$password = $env:PGPASSWORD
if (-not $password) {
    throw "PGPASSWORD environment variable is required"
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = Join-Path $OutputDir "${Database}_${timestamp}.dump"

if (-not (Test-Path -LiteralPath $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

$env:PGPASSWORD = $password

try {
    $compressionLevel = if ($Compress) { 9 } else { 0 }
    $dumpArgs = @(
        "-h", $PgHost,
        "-p", $Port,
        "-U", $Username,
        "-d", $Database,
        "--format=custom",
        "--compress=$compressionLevel",
        "--no-owner",
        "--no-privileges",
        "--file=$backupFile"
    )

    Write-Host "Running pg_dump for ${Database} on ${PgHost}:${Port}..."
    & pg_dump @dumpArgs
    $dumpExitCode = $LASTEXITCODE
    if ($dumpExitCode -ne 0) {
        throw "pg_dump failed with exit code $dumpExitCode"
    }
    if (-not (Test-Path -LiteralPath $backupFile)) {
        throw "Backup file was not created: $backupFile"
    }
    if ((Get-Item -LiteralPath $backupFile).Length -eq 0) {
        throw "Backup file is empty: $backupFile"
    }

    if ($Encrypt) {
        if ($env:AGE_RECIPIENT) {
            if (-not (Get-Command age -ErrorAction SilentlyContinue)) {
                throw "Encryption requested with AGE_RECIPIENT, but age is unavailable"
            }
            $encryptedFile = "$backupFile.age"
            & age -r $env:AGE_RECIPIENT -o $encryptedFile $backupFile
            $encryptExitCode = $LASTEXITCODE
            if ($encryptExitCode -ne 0) {
                throw "age encryption failed with exit code $encryptExitCode"
            }
        } elseif ($env:OPENSSL_PASSWORD) {
            if (-not (Get-Command openssl -ErrorAction SilentlyContinue)) {
                throw "Encryption requested with OPENSSL_PASSWORD, but openssl is unavailable"
            }
            $encryptedFile = "$backupFile.enc"
            & openssl enc -aes-256-cbc -salt -pbkdf2 -in $backupFile -out $encryptedFile -pass env:OPENSSL_PASSWORD
            $encryptExitCode = $LASTEXITCODE
            if ($encryptExitCode -ne 0) {
                throw "openssl encryption failed with exit code $encryptExitCode"
            }
        } else {
            throw "Encryption requested, but AGE_RECIPIENT or OPENSSL_PASSWORD is required"
        }

        Remove-Item -LiteralPath $backupFile -Force
        $backupFile = $encryptedFile
    }

    $checksum = Get-FileHash -LiteralPath $backupFile -Algorithm SHA256
    $checksumFile = "$backupFile.sha256"
    Set-Content -LiteralPath $checksumFile -Value $checksum.Hash -Encoding ascii

    Write-Host "Backup completed: $backupFile"
    Write-Host "SHA256: $($checksum.Hash)"

    $retentionDays = 7
    $cutoff = (Get-Date).AddDays(-$retentionDays)
    Get-ChildItem -LiteralPath $OutputDir -File -Filter "${Database}_*.dump*" |
        Where-Object { $_.LastWriteTime -lt $cutoff } |
        Remove-Item -Force
} finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
