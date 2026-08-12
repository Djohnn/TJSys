<#
.SYNOPSIS
    Strict authenticated smoke test for the TJSys backend.
.DESCRIPTION
    Authenticates an active PDV device and requires HTTP 200 from every
    critical endpoint. Authentication failures are failures, not availability.
#>

param(
    [string]$BaseUrl = $(if ($env:BASE_URL) { $env:BASE_URL } else { "http://localhost:8000" }),
    [string]$ApiKey = $env:API_KEY,
    [string]$TenantId = $env:TENANT_ID
)

$ErrorActionPreference = "Stop"

if (-not $ApiKey) {
    throw "API_KEY or -ApiKey is required for the authenticated smoke test"
}

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Url,
        [hashtable]$Headers = @{}
    )

    try {
        $response = Invoke-WebRequest -Uri $Url -Method Get -Headers $Headers -UseBasicParsing
        if ([int]$response.StatusCode -ne 200) {
            Write-Host "FAIL $Name - HTTP $($response.StatusCode)" -ForegroundColor Red
            return $false
        }
        Write-Host "PASS $Name - HTTP 200" -ForegroundColor Green
        return $true
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "FAIL $Name - HTTP $statusCode - $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

$loginBody = @{ api_key = $ApiKey } | ConvertTo-Json
try {
    $login = Invoke-RestMethod -Uri "$BaseUrl/api/v1/devices/validate/" -Method Post -ContentType "application/json" -Body $loginBody
} catch {
    throw "Device authentication failed: $($_.Exception.Message)"
}

if (-not $login.token -or -not $login.tenant_id) {
    throw "Device authentication response did not include token and tenant_id"
}
if ($TenantId -and $TenantId -ne $login.tenant_id) {
    throw "Authenticated tenant does not match TENANT_ID"
}
$TenantId = $login.tenant_id

$headers = @{
    "Authorization" = "Bearer $($login.token)"
    "X-Tenant-ID" = $TenantId
    "Accept" = "application/json"
}

$results = @()
$results += Test-Endpoint "Health" "$BaseUrl/health/"
$results += Test-Endpoint "Readiness" "$BaseUrl/api/v1/monitoring/ready/"
$results += Test-Endpoint "Metrics" "$BaseUrl/api/v1/monitoring/metrics/" -Headers $headers

$criticalEndpoints = @(
    @{ Name = "Companies API"; Url = "/api/v1/companies/" },
    @{ Name = "Products API"; Url = "/api/v1/products/" },
    @{ Name = "Inventory Locations API"; Url = "/api/v1/inventory/stock-locations/" },
    @{ Name = "Sales API"; Url = "/api/v1/sales/" },
    @{ Name = "Fiscal Documents API"; Url = "/api/v1/fiscal/documents/" }
)

foreach ($endpoint in $criticalEndpoints) {
    $results += Test-Endpoint $endpoint.Name "$BaseUrl$($endpoint.Url)" -Headers $headers
}

$passed = @($results | Where-Object { $_ }).Count
$failed = @($results | Where-Object { -not $_ }).Count
Write-Host "Smoke summary: $passed passed, $failed failed"

if ($failed -gt 0) {
    exit 1
}
exit 0
