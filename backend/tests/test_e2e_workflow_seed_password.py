from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def test_e2e_seed_step_keeps_deterministic_admin_password():
    """Given the CI seed, an absent secret must not replace its password fallback."""
    workflow = (
        PROJECT_ROOT / '.github' / 'workflows' / 'e2e.yml'
    ).read_text(encoding='utf-8')
    seed_step = workflow.split('- name: Install backend deps', 1)[1].split(
        '- name: Start backend',
        1,
    )[0]

    assert 'SEED_ADMIN_PASSWORD:' not in seed_step
