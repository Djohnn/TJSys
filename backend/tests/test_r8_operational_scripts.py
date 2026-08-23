from __future__ import annotations

import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKUP_SCRIPT = REPO_ROOT / 'infra' / 'scripts' / 'backup_postgres.ps1'
RESTORE_SCRIPT = REPO_ROOT / 'infra' / 'scripts' / 'restore_postgres_verify.ps1'
SMOKE_BACKEND_SCRIPT = REPO_ROOT / 'infra' / 'scripts' / 'smoke_backend.ps1'


def _script(path: Path) -> str:
    return path.read_text(encoding='utf-8')


def test_backup_uses_native_custom_format_and_checks_pg_dump_exit_code():
    """Given Windows without gzip, backup shall use pg_dump custom compression."""
    script = _script(BACKUP_SCRIPT)

    assert '--format=custom' in script
    assert re.search(r"\.dump[\"']", script)
    assert '& gzip' not in script
    assert re.search(r'& pg_dump @dumpArgs\s+\$dumpExitCode = \$LASTEXITCODE', script)
    assert 'if ($dumpExitCode -ne 0)' in script


def test_restore_is_fail_closed_and_only_allows_known_compatibility_warning():
    """Given pg_restore failure, restore shall reject anything outside the allowlist."""
    script = _script(RESTORE_SCRIPT)

    assert 'Test-KnownPgRestoreCompatibilityWarning' in script
    assert 'unrecognized configuration parameter "transaction_timeout"' in script
    assert 'errors ignored on restore' in script
    assert '\\s*1\\b' in script
    assert 'throw "pg_restore failed' in script
    assert 'All verification checks passed' in script


def test_restore_validates_database_identifier_and_checksum():
    """Given user-controlled input, restore shall validate identity and integrity."""
    script = _script(RESTORE_SCRIPT)

    assert '^[a-zA-Z_][a-zA-Z0-9_]{0,62}$' in script
    assert 'Get-FileHash' in script
    assert 'Checksum mismatch' in script


def test_backend_smoke_authenticates_and_rejects_authorization_failures():
    """Given valid device credentials, critical smoke probes shall require HTTP 200."""
    script = _script(SMOKE_BACKEND_SCRIPT)

    assert '??' not in script
    assert '/api/v1/devices/validate/' in script
    assert '"Authorization" = "Bearer $($login.token)"' in script
    assert '@(200, 401, 403)' not in script
    assert '/api/v1/inventory/stock-locations/' in script
    assert 'Url = "/api/v1/sales/"' in script
    assert '/api/v1/fiscal/documents/' in script
