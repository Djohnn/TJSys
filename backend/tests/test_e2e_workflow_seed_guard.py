import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
EXPECTED_E2E_SECRET = 'e2e-secret-key-not-for-production'


def test_e2e_seed_step_preserves_effective_secret_key():
    """Given the CI seed step, its effective secret must satisfy the E2E guard."""
    workflow = (
        PROJECT_ROOT / '.github' / 'workflows' / 'e2e.yml'
    ).read_text(encoding='utf-8')
    job_secret = re.search(
        r'(?m)^      SECRET_KEY:\s*([^\r\n]+)$',
        workflow,
    )
    assert job_secret, 'E2E job lost SECRET_KEY'

    seed_step = workflow.split('- name: Install backend deps', 1)[1].split(
        '- name: Start backend',
        1,
    )[0]
    step_secret = re.search(
        r'(?m)^          SECRET_KEY:\s*([^\r\n]+)$',
        seed_step,
    )
    effective_secret = (
        step_secret.group(1).strip().strip("'").strip('"')
        if step_secret
        else job_secret.group(1).strip().strip("'").strip('"')
    )
    assert effective_secret == EXPECTED_E2E_SECRET
