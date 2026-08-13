import re
from pathlib import Path

import pytest

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


def _load_workflow(path: Path) -> dict[str, str]:
    """Extract only the stable workflow/job blocks needed by this contract test.

    This is deliberately not a general YAML parser: unsupported indentation or
    layout fails closed instead of silently accepting a changed workflow.
    """
    text = path.read_text(encoding='utf-8')
    assert re.search(r'(?m)^on:\s*$', text), f'{path} perdeu a chave literal on'
    jobs_match = re.search(r'(?m)^jobs:\s*\r?\n', text)
    assert jobs_match, f'{path} perdeu a seção jobs'
    jobs_text = text[jobs_match.end():]
    headers = list(re.finditer(r'(?m)^  ([A-Za-z0-9_-]+):\s*\r?$', jobs_text))
    assert headers, f'{path} não possui jobs indentados'
    jobs = {}
    for index, header in enumerate(headers):
        end = headers[index + 1].start() if index + 1 < len(headers) else len(jobs_text)
        jobs[header.group(1)] = jobs_text[header.end():end]
    return jobs


def _has_backend_directory(text: str) -> bool:
    return bool(re.search(r'(?m)^[ \t]+working-directory:\s*(?:\./)?backend\s*$', text))


def _steps(job_text: str) -> list[str]:
    headers = list(re.finditer(r'(?m)^      - name:\s*.*?\r?$', job_text))
    return [
        job_text[
            header.start() : headers[index + 1].start()
            if index + 1 < len(headers)
            else len(job_text)
        ]
        for index, header in enumerate(headers)
    ]


def _env(job_text: str) -> dict[str, str]:
    match = re.search(
        r'(?ms)^    env:\s*\r?\n(?P<body>(?:^      [^\r\n]*\r?\n?)+)',
        job_text,
    )
    assert match, 'job seedado sem env no nível do job'
    values = {}
    for line in match.group('body').splitlines():
        key, separator, value = line.strip().partition(':')
        if separator:
            values[key] = value.strip().strip("'").strip('"')
    return values


@pytest.mark.parametrize('workflow_path', WORKFLOWS, ids=lambda path: path.name)
def test_seed_workflow_has_complete_e2e_contract_and_readiness_gate(workflow_path: Path):
    """Given workflow com seed, When parseia CI, Then prova bootstrap E2E antes do browser."""
    workflow = _load_workflow(workflow_path)
    seeded_jobs = [
        (job_name, job_text, _steps(job_text))
        for job_name, job_text in workflow.items()
        if 'seed_e2e' in job_text
    ]

    assert seeded_jobs, f'{workflow_path} não possui job E2E com seed_e2e'
    for job_name, job_text, steps in seeded_jobs:
        env = _env(job_text)
        assert all(env.get(key) == value for key, value in REQUIRED_E2E_ENV.items()), (
            f'{workflow_path}:{job_name} env incompleto: '
            f'{ {key: env.get(key) for key in REQUIRED_E2E_ENV} }'
        )

        manage_steps = [step for step in steps if 'manage.py' in step]
        assert manage_steps
        assert all(_has_backend_directory(step) for step in manage_steps)

        start_indexes = [
            index
            for index, step in enumerate(steps)
            if 'runserver' in step or 'gunicorn' in step
        ]
        assert start_indexes, f'{workflow_path}:{job_name} não inicia Django'
        start_index = min(start_indexes)
        start_step = steps[start_index]
        assert _has_backend_directory(start_step)
        assert '&' in start_step, f'{workflow_path}:{job_name} não inicia em background'

        health_indexes = [
            index
            for index, step in enumerate(steps)
            if '/api/v1/health/' in step and 'curl --fail' in step
        ]
        assert health_indexes, f'{workflow_path}:{job_name} sem health-check determinístico'
        health_index = min(health_indexes)
        health_run = steps[health_index]
        assert health_index > start_index
        assert 'seq 1 30' in health_run
        assert 'exit 1' in health_run

        consumer_indexes = [
            index
            for index, step in enumerate(steps)
            if 'api:generate' in step or 'playwright test' in step
        ]
        assert consumer_indexes
        assert health_index < min(consumer_indexes)


@pytest.mark.parametrize('workflow_path', WORKFLOWS, ids=lambda path: path.name)
def test_playwright_install_covers_configured_projects(workflow_path: Path):
    """Given configured projects, When CI runs all E2E, Then browsers are installed."""
    workflow = _load_workflow(workflow_path)
    config = (PROJECT_ROOT / 'frontend' / 'playwright.config.ts').read_text(encoding='utf-8')
    configured_projects = set(re.findall(r"name:\s*'([^']+)'", config))
    browser_projects = {'chromium', 'firefox', 'webkit'} & configured_projects
    assert browser_projects == {'chromium', 'firefox', 'webkit'}

    seeded_jobs = [job_text for job_text in workflow.values() if 'seed_e2e' in job_text]
    assert seeded_jobs
    for job_text in seeded_jobs:
        steps = _steps(job_text)
        install_steps = [step for step in steps if 'playwright install' in step]
        assert install_steps, f'{workflow_path} sem instalação explícita do Playwright'
        installed = set(
            re.findall(r'\b(chromium|firefox|webkit)\b', '\n'.join(install_steps))
        )

        run_steps = [
            step
            for step in steps
            if 'playwright test' in step or 'test:e2e' in step
        ]
        assert run_steps, f'{workflow_path} sem execução E2E'
        run_text = '\n'.join(run_steps)
        explicit_projects = set(
            re.findall(r'--project(?:=|\s+)(chromium|firefox|webkit)', run_text)
        )
        expected = explicit_projects or browser_projects
        assert expected <= installed, (
            f'{workflow_path} instala {sorted(installed)}, '
            f'mas executa/exige {sorted(expected)}'
        )
