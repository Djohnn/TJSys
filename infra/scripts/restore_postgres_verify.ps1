<#
.SYNOPSIS
    Restores a custom-format backup into a disposable database and verifies it.
.DESCRIPTION
    The drill is fail-closed. The only accepted non-zero pg_restore result is
    the known PG18-to-PG16 transaction_timeout compatibility warning.
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$BackupFile,
    [string]$TargetDb = $null,
    [string]$PgHost = $(if ($env:PGHOST) { $env:PGHOST } else { "localhost" }),
    [string]$PgPort = $(if ($env:PGPORT) { $env:PGPORT } else { "5432" }),
    [string]$PgUser = $(if ($env:PGUSER) { $env:PGUSER } else { "tjsys_app" }),
    [string]$PgPassword = $env:PGPASSWORD,
    [switch]$KeepDatabase = $false
)

$ErrorActionPreference = "Stop"

function Test-KnownPgRestoreCompatibilityWarning {
    param(
        [int]$ExitCode,
        [string]$Output
    )

    if ($ExitCode -eq 0) {
        return $true
    }

    $lines = $Output -split "`r?`n"
    $errorLines = @($lines | Where-Object { $_ -match '(?i)(?:^|:\s*)(?:error|erro):' })
    $hasTransactionTimeout = $Output -match 'unrecognized configuration parameter "transaction_timeout"'
    $hasSingleIgnoredError = $Output -match '(?i)(?:errors ignored on restore|erros ignorados na restaura[cç][aã]o):\s*1\b'
    $unexpectedErrors = @($errorLines | Where-Object {
        $_ -notmatch 'transaction_timeout' -and
        $_ -notmatch '(?i)(?:errors ignored on restore|erros ignorados na restaura[cç][aã]o):\s*1\b'
    })

    return $hasTransactionTimeout -and $hasSingleIgnoredError -and $unexpectedErrors.Count -eq 0
}

function Invoke-PsqlScalar {
    param([string]$Database, [string]$Query)

    $result = & psql -h $PgHost -p $PgPort -U $PgUser -d $Database -Atqc $Query 2>&1
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        throw "Verification query failed: $result"
    }
    return "$result".Trim()
}

if (-not $PgPassword) {
    throw "PGPASSWORD environment variable is required"
}
if (-not (Test-Path -LiteralPath $BackupFile)) {
    throw "Backup file not found: $BackupFile"
}
if (-not $TargetDb) {
    $TargetDb = "tjsys_restore_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
}
if ($TargetDb -notmatch '^[a-zA-Z_][a-zA-Z0-9_]{0,62}$') {
    throw "Invalid target database identifier: $TargetDb"
}

$checksumFile = "$BackupFile.sha256"
if (Test-Path -LiteralPath $checksumFile) {
    $expectedChecksum = (Get-Content -LiteralPath $checksumFile -Raw).Trim()
    $actualChecksum = (Get-FileHash -LiteralPath $BackupFile -Algorithm SHA256).Hash
    if ($expectedChecksum -ne $actualChecksum) {
        throw "Checksum mismatch for backup: $BackupFile"
    }
}

$env:PGPASSWORD = $PgPassword
$databaseCreated = $false

try {
    $createOutput = & psql -h $PgHost -p $PgPort -U $PgUser -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $TargetDb;" 2>&1
    $createExitCode = $LASTEXITCODE
    if ($createExitCode -ne 0) {
        throw "Failed to create database: $createOutput"
    }
    $databaseCreated = $true

    # Windows PowerShell promotes native stderr to ErrorRecord. pg_restore -v
    # writes normal progress to stderr, so capture it without aborting early.
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $restoreOutput = & pg_restore -h $PgHost -p $PgPort -U $PgUser -d $TargetDb -F custom -v $BackupFile 2>&1
        $restoreExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    $restoreText = $restoreOutput -join "`n"
    if (-not (Test-KnownPgRestoreCompatibilityWarning -ExitCode $restoreExitCode -Output $restoreText)) {
        throw "pg_restore failed with exit code ${restoreExitCode}: $restoreText"
    }
    if ($restoreExitCode -ne 0) {
        Write-Warning "Accepted only the known transaction_timeout compatibility warning"
    }

    $criticalTables = @(
        "tenancy_tenant",
        "accounts_customuser",
        "catalog_product",
        "sales_sale",
        "fiscal_fiscaldocument",
        "outbox_outboxmessage",
        "django_migrations"
    )
    foreach ($table in $criticalTables) {
        $exists = Invoke-PsqlScalar -Database $TargetDb -Query "SELECT CASE WHEN to_regclass('public.$table') IS NULL THEN 0 ELSE 1 END;"
        if ($exists -ne "1") {
            throw "Critical table missing after restore: $table"
        }
    }

    $tableCount = Invoke-PsqlScalar -Database $TargetDb -Query "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
    if ([int]$tableCount -lt $criticalTables.Count) {
        throw "Unexpected table count after restore: $tableCount"
    }

    foreach ($table in $criticalTables | Where-Object { $_ -ne "django_migrations" }) {
        [void](Invoke-PsqlScalar -Database $TargetDb -Query "SELECT count(*) FROM $table;")
    }

    $indexCount = Invoke-PsqlScalar -Database $TargetDb -Query "SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND (indexname LIKE '%unique%' OR indexname LIKE '%tenant%');"
    if ([int]$indexCount -lt 1) {
        throw "No critical tenant/unique index found after restore"
    }

    Write-Host "All verification checks passed"
} finally {
    if ($databaseCreated -and -not $KeepDatabase) {
        & psql -h $PgHost -p $PgPort -U $PgUser -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $TargetDb WITH (FORCE);" 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Could not drop disposable database: $TargetDb"
        }
    }
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
