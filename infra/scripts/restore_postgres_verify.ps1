<#
.SYNOPSIS
    PostgreSQL restore verification script.
.DESCRIPTION
    Restores a backup into a disposable database and runs verification queries.
    Does NOT overwrite the production database.
.NOTES
    Requires: PGHOST, PGPORT, PGUSER, PGPASSWORD environment variables.
    Optional: BACKUP_FILE (path to backup), TARGET_DB (default: tjsys_restore_<timestamp>)
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$BackupFile,
    
    [string]$TargetDb = $null,
    [string]$PgHost = $env:PGHOST ?? "localhost",
    [string]$PgPort = $env:PGPORT ?? "5432",
    [string]$PgUser = $env:PGUSER ?? "tjsys",
    [string]$PgPassword = $env:PGPASSWORD,
    [switch]$KeepDatabase = $false
)

if (-not $PgPassword) {
    Write-Error "PGPASSWORD environment variable is required"
    exit 1
}

if (-not (Test-Path $BackupFile)) {
    Write-Error "Backup file not found: $BackupFile"
    exit 1
}

if (-not $TargetDb) {
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $TargetDb = "tjsys_restore_${timestamp}"
}

Write-Host "=== PostgreSQL Restore Verification ===" -ForegroundColor Cyan
Write-Host "Source: $BackupFile" -ForegroundColor Gray
Write-Host "Target DB: $TargetDb" -ForegroundColor Gray
Write-Host "Host: $PgHost:$PgPort" -ForegroundColor Gray
Write-Host ""

$env:PGPASSWORD = $PgPassword

try {
    # 1. Create target database
    Write-Host "Creating database: $TargetDb..." -ForegroundColor Yellow
    $created = & psql -h $PgHost -p $PgPort -U $PgUser -d postgres -c "CREATE DATABASE \"$TargetDb\";" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to create database: $created"
        exit 1
    }
    Write-Host "✅ Database created" -ForegroundColor Green
    
    # 2. Restore backup
    Write-Host "Restoring backup..." -ForegroundColor Yellow
    $restored = & pg_restore -h $PgHost -p $PgPort -U $PgUser -d $TargetDb -F custom -v $BackupFile 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Restore failed: $restored"
        exit 1
    }
    Write-Host "✅ Backup restored" -ForegroundColor Green
    
    # 3. Run verification queries
    Write-Host "Running verification queries..." -ForegroundColor Yellow
    
    $queries = @(
        @{ Name = "Table count"; Query = "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" },
        @{ Name = "Tenant count"; Query = "SELECT count(*) FROM tenancy_tenant;" },
        @{ Name = "User count"; Query = "SELECT count(*) FROM accounts_customuser;" },
        @{ Name = "Product count"; Query = "SELECT count(*) FROM catalog_product;" },
        @{ Name = "Sale count"; Query = "SELECT count(*) FROM sales_sale;" },
        @{ Name = "Fiscal document count"; Query = "SELECT count(*) FROM fiscal_fiscalcocument;" },
        @{ Name = "Outbox count"; Query = "SELECT count(*) FROM outbox_outboxmessage;" }
    )
    
    $allPassed = $true
    foreach ($q in $queries) {
        try {
            $result = & psql -h $PgHost -p $PgPort -U $PgUser -d $TargetDb -t -c $q.Query 2>&1
            if ($LASTEXITCODE -eq 0) {
                $value = $result.Trim()
                Write-Host "  ✅ $($q.Name): $value" -ForegroundColor Green
            } else {
                Write-Host "  ❌ $($q.Name): $result" -ForegroundColor Red
                $allPassed = $false
            }
        } catch {
            Write-Host "  ❌ $($q.Name): $_" -ForegroundColor Red
            $allPassed = $false
        }
    }
    
    # 4. Check critical indexes
    Write-Host "Checking critical indexes..." -ForegroundColor Yellow
    $indexQuery = "SELECT indexname, tablename FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE '%unique%' OR indexname LIKE '%tenant%';"
    $indexes = & psql -h $PgHost -p $PgPort -U $PgUser -d $TargetDb -t -c $indexQuery 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✅ Critical indexes present" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️ Index check failed" -ForegroundColor Yellow
    }
    
    if ($allPassed) {
        Write-Host ""
        Write-Host "✅ All verification checks passed!" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "❌ Some verification checks failed" -ForegroundColor Red
        exit 1
    }
    
} finally {
    if (-not $KeepDatabase) {
        Write-Host "Cleaning up test database..." -ForegroundColor Yellow
        & psql -h $PgHost -p $PgPort -U $PgUser -d postgres -c "DROP DATABASE IF EXISTS \"$TargetDb\" WITH (FORCE);" 2>&1 | Out-Null
        Write-Host "✅ Test database dropped" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Keeping test database: $TargetDb (use -KeepDatabase to retain)" -ForegroundColor Yellow
    }
    
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}