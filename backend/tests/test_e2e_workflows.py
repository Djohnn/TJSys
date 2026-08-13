from pathlib import Path

import pytest
import yaml

PROJECT_ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = (
    PROJECT_ROOT / '.github' / 'workflows' / 'e2e.yml',
    PROJECT_ROOT / '.github' / 'workflows' / 'ci.yml',
)
REQUIRED_E2E_ENV = {
    'DJANGO_SETTINGS_MODULE': 'config.settings.e2e',
    'E2E_SEED': '1',
    'E2E_USER_EMAIL': 'web-admin@tjsys.local',
    'E2E_USER_PASSWORD': 'e2e-test-pwd-2026',
    'E2E_RECOVERY_CODE': 'e2e0000001',
    'POSTGRES_HOST': 'localhost',
    'POSTGRES_DB': 'zyrp',
    'POSTGRES_APP_USER': 'zyrp',
    'POSTGRES_APP_PASSWORD': 'zyrp',
    'SECRET_KEY': 'e2e-secret-key-not-for-production',
}


def _load_workflow(path: Path) -> dict:
    with path.open(encoding='utf-8') as workflow_file:
        workflow = yaml.load(workflow_file, Loader=yaml.BaseLoader)
    assert isinstance(workflow, dict)
    assert 'on' in workflow, f'{path} perdeu a chave literal on'
    assert isinstance(workflow.get('jobs'), dict)
    return workflow


def _is_backend_directory(value: object) -> bool:
    return str(value).replace('./', '').strip('/') == 'backend'


def _run(step: dict) -> str:
    return str(step.get('run', ''))


@pytest.mark.parametrize('workflow_path', WORKFLOWS, ids=lambda path: path.name)
def test_seed_workflow_has_complete_e2e_contract_and_readiness_gate(workflow_path: Path):
    """Given workflow com seed, When parseia CI, Then prova bootstrap E2E antes do browser."""
    workflow = _load_workflow(workflow_path)
    seeded_jobs = []
    for job_name, job in workflow['jobs'].items():
        steps = job.get('steps', [])
        if any('seed_e2e' in _run(step) for step in steps):
            seeded_jobs.append((job_name, job, steps))

    assert seeded_jobs, f'{workflow_path} não possui job E2E com seed_e2e'
    for job_name, job, steps in seeded_jobs:
        env = job.get('env', {})
        assert env == {**env, **REQUIRED_E2E_ENV}, f'{workflow_path}:{job_name} env incompleto'

        manage_steps = [step for step in steps if 'manage.py' in _run(step)]
        assert manage_steps
        assert all(_is_backend_directory(step.get('working-directory')) for step in manage_steps)

        start_indexes = [
            index
            for index, step in enumerate(steps)
            if 'runserver' in _run(step) or 'gunicorn' in _run(step)
        ]
        assert start_indexes, f'{workflow_path}:{job_name} não inicia Django'
        start_index = min(start_indexes)
        start_step = steps[start_index]
        assert _is_backend_directory(start_step.get('working-directory'))
        assert '&' in _run(start_step), f'{workflow_path}:{job_name} não inicia em background'

        health_indexes = [
            index
            for index, step in enumerate(steps)
            if '/api/v1/health/' in _run(step) and 'curl --fail' in _run(step)
        ]
        assert health_indexes, f'{workflow_path}:{job_name} sem health-check determinístico'
        health_index = min(health_indexes)
        health_run = _run(steps[health_index])
        assert health_index > start_index
        assert 'seq 1 30' in health_run
        assert 'exit 1' in health_run

        consumer_indexes = [
            index
            for index, step in enumerate(steps)
            if 'api:generate' in _run(step) or 'playwright test' in _run(step)
        ]
        assert consumer_indexes
        assert health_index < min(consumer_indexes)
