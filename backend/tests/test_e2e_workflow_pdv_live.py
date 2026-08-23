from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def test_e2e_pdv_live_gate_uses_seeded_environment():
    """Given the seeded CI environment, the PDV live gate must collect and run."""
    workflow = (PROJECT_ROOT / '.github' / 'workflows' / 'e2e.yml').read_text(encoding='utf-8')
    pdv_step = workflow.split('- name: Run PDV vertical acceptance', 1)[1].split(
        '- name: Check Design Tokens',
        1,
    )[0]
    global_setup = (PROJECT_ROOT / 'pdv' / 'e2e' / 'global-setup.ts').read_text(
        encoding='utf-8',
    )

    assert "E2E_LIVE_PDV: '1'" in workflow
    assert 'E2E_PDV_API_KEY: e2e-test-key-2026' in workflow
    assert 'E2E_ADMIN_RECOVERY_CODE: e2e0000001' in workflow
    assert 'E2E_API_BASE_URL: http://127.0.0.1:8000/api/v1' in workflow
    assert '- name: Start frontend for PDV stock verification' in workflow
    assert '- name: Wait for frontend PDV verification' in workflow
    assert 'secrets.E2E_PDV_API_KEY' not in pdv_step
    assert 'secrets.E2E_USER_EMAIL' not in pdv_step
    assert 'secrets.E2E_USER_PASSWORD' not in pdv_step
    assert 'secrets.E2E_ADMIN_RECOVERY_CODE' not in pdv_step
    assert "if (process.env.E2E_LIVE_PDV === '1')" not in global_setup
