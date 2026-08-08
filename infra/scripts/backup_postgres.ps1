<#
.SYNOPSIS
    PostgreSQL backup script for TJSys ERP.

.DESCRIPTION
    Creates a compressed, encrypted backup of the PostgreSQL database.
    Uses environment variables for credentials (no hardcoded secrets).

.PARAMETER OutputDir
    Directory to store backup files (default: ./backups)

.PARAMETER Compress
    Compress backup with gzip (default: true)

.PARAMETER Encrypt
    Encrypt backup with age/openssl (default: false, requires AGE_RECIPIENT or OPENSSL_PASSWORD env)

.EXAMPLE
    .\backup_postgres.ps1 -OutputDir "C:\backups"
#>

param(
    [string]$OutputDir = ".\backups",
    [switch]$Compress = $true,
    [switch]$Encrypt = $false,
    [string]$Host = "127.0.0.1",
    [int]$Port = 5432,
    [string]$Database = "tjsys",
    [string]$Username = "tjsys_app"
)

$ErrorActionPreference = "Stop"

# Load credentials from environment
$password = $env:POSTGRES_PASSWORD
if (-not $password) {
    Write-Error "POSTGRES_PASSWORD environment variable not set"
    exit 1
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = "$OutputDir\${Database}_${timestamp}.sql"
$finalFile = $backupFile

# Create output directory
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

Write-Host "Starting PostgreSQL backup..." -ForegroundColor Cyan
Write-Host "  Database: $Database" -ForegroundColor Gray
Write-Host "  Host: $Host:$Port" -ForegroundColor Gray
Write-Host "  Output: $backupFile" -ForegroundColor Gray

$env:PGPASSWORD = $password

try {
    # Run pg_dump
    $dumpArgs = @(
        "-h", $Host,
        "-p", $Port,
        "-U", $Username,
        "-d", $Database,
        "--format=custom",
        "--compress=9",
        "--no-owner",
        "--no-privileges",
        "--file=$backupFile"
    )
    
    Write-Host "Running pg_dump..." -ForegroundColor Yellow
    & pg_dump @dumpArgs
    
    if (-not (Test-Path $backupFile)) {
        throw "Backup file not created"
    }
    
    $size = (Get-Item $backupFile).Length
    Write-Host "✅ Backup created: $([math]::Round($size/1MB, 2)) MB" -ForegroundColor Green
    
    # Optional: Compress further with gzip
    if ($Compress -and $backupFile -notmatch '\.gz$') {
        Write-Host "Compressing with gzip..." -ForegroundColor Yellow
        & gzip -f $backupFile
        $backupFile = "$backupFile.gz"
        $size = (Get-Item $backupFile).Length
        Write-Host "✅ Compressed: $([math]::Round($size/1MB, 2)) MB" -ForegroundColor Green
    }
    
    # Optional: Encrypt with age (preferred) or openssl
    if ($Encrypt) {
        Write-Host "Encrypting backup..." -ForegroundColor Yellow
        
        if ($env:AGE_RECIPIENT) {
            # Encrypt with age
            $encryptedFile = "$backupFile.age"
            & age -r $env:AGE_RECIPIENT -o $encryptedFile $backupFile
            Remove-Item $backupFile -Force
            $backupFile = $encryptedFile
            Write-Host "✅ Encrypted with age" -ForegroundColor Green
        } elseif ($env:OPENSSL_PASSWORD) {
            # Encrypt with openssl
            $encryptedFile = "$backupFile.enc"
            & openssl enc -aes-256-cbc -salt -pbkdf2 -in $backupFile -out $encryptedFile -pass env:OPENSSL_PASSWORD
            Remove-Item $backupFile -Force
            $backupFile = $encryptedFile
            Write-Host "✅ Encrypted with openssl" -ForegroundColor Green
        } else {
            Write-Warning "Encryption requested but no AGE_RECIPIENT or OPENSSL_PASSWORD set"
        }
    }
    
    # Generate checksum
    $checksum = Get-FileHash -Path $backupFile -Algorithm SHA256
    $checksumFile = "$backupFile.sha256"
    $checksum.Hash | Set-Content -Path $checksumFile
    Write-Host "✅ Checksum saved: $checksumFile" -ForegroundColor Green
    
    # Output summary
    Write-Host ""
    Write-Host "=== Backup Summary ===" -ForegroundColor Cyan
    Write-Host "File: $backupFile"
    Write-Host "Size: $([math]::Round((Get-Item $backupFile).Length/1MB, 2)) MB"
    Write-Host "Checksum: $($checksum.Hash)"
    Write-Host "Timestamp: $timestamp"
    
    # Cleanup old backups (keep last 7 days)
    $retentionDays = 7
    $oldBackups = Get-ChildItem $OutputDir -Filter "${Database}_*.sql*" | Where-Object { 
        $_.LastWriteTime -lt (Get-Date).AddDays(-$retentionDays) 
    }
    if ($oldBackups) {
        Write-Host "Cleaning up old backups (> $retentionDays days)..." -ForegroundColor Yellow
        $oldBackups | Remove-Item -Force
        Write-Host "✅ Removed $($oldBackups.Count) old backup(s)" -ForegroundColor Green
    }
    
} finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}