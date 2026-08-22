import ast
import json
import re
import subprocess
import tomllib
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


def _e2e_compose_backend_environment() -> str:
    compose = (PROJECT_ROOT / 'docker-compose.e2e.yml').read_text(encoding='utf-8')
    backend_match = re.search(
        r'(?ms)^  backend:\s*\n(?P<body>.*?)(?=^  frontend:|\Z)',
        compose,
    )
    assert backend_match, 'docker-compose.e2e.yml perdeu o serviço backend'
    environment_match = re.search(
        r'(?ms)^    environment:\s*\n(?P<body>(?:^      [^\n]*\n?)+)',
        backend_match.group('body'),
    )
    assert environment_match, 'backend E2E perdeu o bloco environment'
    return environment_match.group('body')


def test_e2e_compose_routes_cache_and_celery_to_redis_service():
    """Given E2E in Docker, when loading settings, then all Redis clients use redis service."""
    environment = _e2e_compose_backend_environment()

    # Given the Docker service is named ``redis`` and listens on its internal port.
    # When Django initializes cache and Celery from the Compose environment.
    # Then no client may fall back to a host-only localhost port.
    assert '      REDIS_URL: redis://redis:6379\n' in environment
    assert '      CELERY_BROKER_URL: redis://redis:6379/1\n' in environment
    assert '      CELERY_RESULT_BACKEND: redis://redis:6379/2\n' in environment


def _load_workflow(path: Path) -> dict[str, str]:
    """Extract only the stable workflow/job blocks needed by this contract test.

    This is deliberately not a general YAML parser: unsupported indentation or
    layout fails closed instead of silently accepting a changed workflow.
    """
    text = path.read_text(encoding='utf-8')
    assert re.search(r'(?m)^on:\s*$', text), f'{path} perdeu a chave literal on'
    jobs_match = re.search(r'(?m)^jobs:\s*\r?\n', text)
    assert jobs_match, f'{path} perdeu a seção jobs'
    jobs_text = text[jobs_match.end() :]
    headers = list(re.finditer(r'(?m)^  ([A-Za-z0-9_-]+):\s*\r?$', jobs_text))
    assert headers, f'{path} não possui jobs indentados'
    jobs = {}
    for index, header in enumerate(headers):
        end = headers[index + 1].start() if index + 1 < len(headers) else len(jobs_text)
        jobs[header.group(1)] = jobs_text[header.end() : end]
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


def _top_level_env_keys(workflow_text: str) -> set[str]:
    match = re.search(
        r'(?ms)^env:\s*\r?\n(?P<body>(?:^  [A-Za-z0-9_]+:[^\r\n]*\r?\n?)+)',
        workflow_text,
    )
    if not match:
        return set()
    return {
        line.strip().split(':', 1)[0] for line in match.group('body').splitlines() if ':' in line
    }


def _top_level_env(workflow_text: str) -> dict[str, str]:
    match = re.search(
        r'(?ms)^env:\s*\r?\n(?P<body>(?:^  [A-Za-z0-9_]+:[^\r\n]*\r?\n?)+)',
        workflow_text,
    )
    assert match, 'workflow sem env no nível superior'
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
            index for index, step in enumerate(steps) if 'runserver' in step or 'gunicorn' in step
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
def test_e2e_workflows_route_celery_to_redis_databases(workflow_path: Path):
    """Given CI Redis, when Django starts E2E, then Celery uses DB1/DB2 explicitly."""
    workflow_text = workflow_path.read_text(encoding='utf-8')
    if workflow_path.name == 'e2e.yml':
        workflow = _load_workflow(workflow_path)
        job_text = next(job for job in workflow.values() if 'seed_e2e' in job)
        env = _env(job_text)
    else:
        env = _top_level_env(workflow_text)

    # Given Redis is exposed on localhost:6379 in both CI service definitions.
    # When Django/Celery settings are loaded in the E2E job.
    # Then broker and result backend must use separate, explicit Redis databases.
    assert env['REDIS_URL'] == 'redis://localhost:6379/0'
    assert env['CELERY_BROKER_URL'] == 'redis://localhost:6379/1'
    assert env['CELERY_RESULT_BACKEND'] == 'redis://localhost:6379/2'


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
        installed = set(re.findall(r'\b(chromium|firefox|webkit)\b', '\n'.join(install_steps)))

        run_steps = [step for step in steps if 'playwright test' in step or 'test:e2e' in step]
        assert run_steps, f'{workflow_path} sem execução E2E'
        run_text = '\n'.join(run_steps)
        explicit_projects = set(
            re.findall(r'--project(?:=|\s+)(chromium|firefox|webkit)', run_text)
        )
        expected = explicit_projects or browser_projects
        assert expected <= installed, (
            f'{workflow_path} instala {sorted(installed)}, mas executa/exige {sorted(expected)}'
        )


@pytest.mark.parametrize('workflow_path', WORKFLOWS, ids=lambda path: path.name)
def test_auth_throttles_are_scoped_to_seeded_e2e_job(workflow_path: Path):
    """Given CI workflows, When rates are configured, Then they stay E2E-job scoped."""
    workflow_text = workflow_path.read_text(encoding='utf-8')
    global_keys = _top_level_env_keys(workflow_text)
    assert {'AUTH_LOGIN_RATE', 'AUTH_MFA_RATE'}.isdisjoint(global_keys)

    workflow = _load_workflow(workflow_path)
    seeded_jobs = [job_text for job_text in workflow.values() if 'seed_e2e' in job_text]
    assert seeded_jobs
    for job_text in seeded_jobs:
        job_env = _env(job_text)
        assert job_env['AUTH_LOGIN_RATE'] == '100/minute'
        assert job_env['AUTH_MFA_RATE'] == '100/minute'


@pytest.mark.parametrize('workflow_path', WORKFLOWS, ids=lambda path: path.name)
def test_recovery_code_is_scoped_to_seeded_e2e_job(workflow_path: Path):
    """Given CI workflows, When recovery is configured, Then it stays E2E-job scoped."""
    workflow_text = workflow_path.read_text(encoding='utf-8')
    assert 'E2E_RECOVERY_CODE' not in _top_level_env_keys(workflow_text)

    workflow = _load_workflow(workflow_path)
    seeded_jobs = [job_text for job_text in workflow.values() if 'seed_e2e' in job_text]
    assert seeded_jobs
    assert all(_env(job_text)['E2E_RECOVERY_CODE'] == 'e2e0000001' for job_text in seeded_jobs)


def test_e2e_workflow_delegates_frontend_readiness_to_playwright_web_server():
    """Given the dedicated E2E workflow, When Playwright runs, Then Vite is not started twice."""
    workflow_path = PROJECT_ROOT / '.github' / 'workflows' / 'e2e.yml'
    workflow = _load_workflow(workflow_path)
    job_text = workflow['e2e']
    steps = _steps(job_text)

    assert not any('Start frontend' in step for step in steps)
    frontend_install_index = job_text.index('- name: Install frontend deps')
    playwright_index = job_text.index('- name: Run Playwright E2E')
    frontend_start_region = job_text[frontend_install_index:playwright_index]
    assert not re.search(r'(?m)^\s*npx vite\b', frontend_start_region)
    assert not re.search(r'(?m)^\s*sleep\s+\d+\s*$', frontend_start_region)
    assert any('playwright test' in step for step in steps)
    assert _env(job_text)['VITE_API_BASE_URL'] == '/api/v1'

    config = (PROJECT_ROOT / 'frontend' / 'playwright.config.ts').read_text(encoding='utf-8')
    assert re.search(r'(?m)^\s*webServer:\s*\{', config)
    assert re.search(r'url:\s*baseURL', config)
    assert '--host 127.0.0.1' in config


def test_docker_e2e_frontend_proxies_api_to_backend_service():
    """Given containerized Vite, When it proxies /api, Then it targets backend DNS."""
    compose = (PROJECT_ROOT / 'docker-compose.e2e.yml').read_text(encoding='utf-8')
    vite_config = (PROJECT_ROOT / 'frontend' / 'vite.config.ts').read_text(encoding='utf-8')

    assert 'VITE_API_PROXY_TARGET: http://backend:8000' in compose
    assert 'ALLOWED_HOSTS: localhost,127.0.0.1,backend' in compose
    assert 'process.env.VITE_API_PROXY_TARGET' in vite_config


def test_playwright_config_is_deterministic_and_traces_failures_without_retries():
    """Given Playwright projects, When CI runs them, Then scheduling is fixed and traceable."""
    config = (PROJECT_ROOT / 'frontend' / 'playwright.config.ts').read_text(encoding='utf-8')
    assert re.search(r'(?m)^\s*retries:\s*0\s*,?\s*$', config)
    assert re.search(r'(?m)^\s*workers:\s*1\s*,?\s*$', config)
    assert re.search(r"trace:\s*'(?:retain-on-failure|off)'", config)
    assert 'on-first-retry' not in config


def test_playwright_authentication_consumes_the_seeded_recovery_code_once():
    """Given one-use MFA recovery codes, global setup owns one login state."""
    frontend_root = PROJECT_ROOT / 'frontend'
    config = (frontend_root / 'playwright.config.ts').read_text(encoding='utf-8')
    fixtures = (frontend_root / 'e2e' / 'fixtures.ts').read_text(encoding='utf-8')
    global_setup = frontend_root / 'e2e' / 'global-setup.ts'
    global_teardown = frontend_root / 'e2e' / 'global-teardown.ts'
    gitignore = (frontend_root / '.gitignore').read_text(encoding='utf-8')

    assert global_setup.is_file(), 'o login MFA deve ocorrer uma vez no global setup'
    assert global_teardown.is_file(), 'a credencial persistida deve ser removida após a suíte'
    setup_source = global_setup.read_text(encoding='utf-8')
    teardown_source = global_teardown.read_text(encoding='utf-8')
    assert "globalSetup: './e2e/global-setup'" in config
    assert "globalTeardown: './e2e/global-teardown'" in config
    assert 'storageState: authStorageState' in config
    assert 'await authenticatePage(page)' in setup_source
    assert 'await rm(authStorageDirectory, { recursive: true, force: true })' in teardown_source
    assert 'test-results/.auth/' in gitignore.splitlines()
    assert 'await authenticatePage(page)' not in fixtures
    assert "await page.goto('/dashboard')" in fixtures
    assert 'anonymousPage' in fixtures
    assert 'storageState: { cookies: [], origins: [] }' in fixtures
    auth_spec = (frontend_root / 'e2e' / 'auth-tenant.spec.ts').read_text(encoding='utf-8')
    assert 'async function mockLogout(page: Page): Promise<() => void>' in auth_spec
    assert auth_spec.count('await mockLogout(page)') == 2
    assert 'await mockUnauthenticatedSession(page)' in auth_spec
    assert 'page.waitForRequest' in auth_spec
    assert "request.method() === 'POST'" in auth_spec
    assert 'expect(requestCount).toBe(1)' in auth_spec


def test_e2e_workflow_runs_the_browser_owned_by_the_single_mfa_session():
    """Given one Chromium login state, CI must not reuse it in other browsers."""
    workflow = _load_workflow(PROJECT_ROOT / '.github' / 'workflows' / 'e2e.yml')
    steps = _steps(workflow['e2e'])

    install_step = next(step for step in steps if 'playwright install' in step)
    run_step = next(step for step in steps if 'playwright test' in step)

    assert 'playwright install --with-deps chromium' in install_step
    assert 'firefox' not in install_step
    assert 'webkit' not in install_step
    assert '--project=chromium' in run_step


def test_compose_e2e_backend_image_contract_is_buildable_for_seeded_django_runtime():
    """Given the official compose file, its backend image can run Django bootstrap."""
    compose_file = PROJECT_ROOT / 'docker-compose.e2e.yml'
    result = subprocess.run(
        ['docker', 'compose', '-f', str(compose_file), 'config', '--format', 'json'],
        cwd=PROJECT_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    backend = json.loads(result.stdout)['services']['backend']
    assert Path(backend['build']['context']).resolve() == (PROJECT_ROOT / 'backend').resolve()
    assert backend['build']['dockerfile'] == 'Dockerfile'
    backend_command = ' '.join(backend['command'])
    assert 'migrate --noinput' in backend_command
    assert 'seed_e2e' in backend_command
    assert 'runserver' in backend_command
    healthcheck = backend['healthcheck']
    healthcheck_command = ' '.join(healthcheck['test'])
    assert '/api/v1/health/' in healthcheck_command
    assert 'python' in healthcheck_command

    frontend = json.loads(result.stdout)['services']['frontend']
    assert frontend['depends_on']['backend']['condition'] == 'service_healthy'

    dockerfile = PROJECT_ROOT / 'backend' / backend['build']['dockerfile']
    assert dockerfile.is_file(), 'backend Dockerfile is required by the official E2E compose build'
    contents = dockerfile.read_text(encoding='utf-8')
    dockerignore = (PROJECT_ROOT / 'backend' / '.dockerignore').read_text(encoding='utf-8')
    ignored = set(dockerignore.splitlines())
    required_ignores = {
        '.env*',
        '.venv/',
        '__pycache__/',
        '.test-cache/',
        '.coverage*',
        'tests/',
        '.git/',
    }
    assert required_ignores <= ignored
    assert {'*.py', 'migrations/', 'pyproject.toml'}.isdisjoint(ignored)
    assert re.search(r'^FROM python:3\.12(?:[-\w.]*)?$', contents, re.MULTILINE)
    assert 'WORKDIR /app' in contents
    metadata_copy = contents.index('COPY pyproject.toml README.md ./')
    dependency_install = contents.index('pip install --no-cache-dir', metadata_copy)
    source_copy = contents.index('COPY . .')
    package_install = contents.index('pip install --no-cache-dir .', source_copy)
    assert metadata_copy < dependency_install < source_copy < package_install
    assert re.search(r'^COPY \. \.$', contents, re.MULTILINE)
    assert re.search(r'^USER \w+$', contents, re.MULTILINE)


def test_runtime_imports_are_declared_in_backend_distribution_metadata():
    """Given runtime imports, distribution metadata declares their external packages offline."""
    backend_root = PROJECT_ROOT / 'backend'
    metadata = tomllib.loads((backend_root / 'pyproject.toml').read_text(encoding='utf-8'))
    requirements = '\n'.join(metadata['project']['dependencies']).lower()
    fiscal_adapter = (backend_root / 'fiscal' / 'adapters' / 'plugnotas.py').read_text(
        encoding='utf-8'
    )
    device_auth = (backend_root / 'tenancy' / 'authentication.py').read_text(encoding='utf-8')

    assert re.search(r'(?m)^import requests$', fiscal_adapter)
    assert 'requests' in requirements
    assert 'rest_framework_simplejwt' in device_auth
    assert 'djangorestframework-simplejwt' in requirements


def test_mypy_excludes_derived_build_directories_on_windows_and_linux():
    """Given derived package builds, mypy ignores them on either path separator."""
    backend_root = PROJECT_ROOT / 'backend'
    metadata = tomllib.loads((backend_root / 'pyproject.toml').read_text(encoding='utf-8'))
    exclusions = metadata['tool']['mypy']['exclude']

    assert any(re.search(pattern, 'build/lib/accounts/__init__.py') for pattern in exclusions)
    assert any(re.search(pattern, r'build\lib\accounts\__init__.py') for pattern in exclusions)
    assert not any(re.search(pattern, 'accounts/__init__.py') for pattern in exclusions)


def test_ci_preprovisions_test_database_for_the_unprivileged_test_runtime():
    """Given CI pytest uses test_zyrp, When roles bootstrap, Then owner creates it before pytest."""
    workflow_path = PROJECT_ROOT / '.github' / 'workflows' / 'ci.yml'
    workflow = _load_workflow(workflow_path)
    ci_job = workflow['ci']
    steps = _steps(ci_job)
    workflow_text = workflow_path.read_text(encoding='utf-8')
    test_settings = ast.parse(
        (PROJECT_ROOT / 'backend' / 'config' / 'settings' / 'test.py').read_text(encoding='utf-8')
    )
    roles_script = (PROJECT_ROOT / 'infra' / 'postgres' / 'init' / '001_roles.sh').read_text(
        encoding='utf-8'
    )

    assert 'POSTGRES_TEST_DB: test_zyrp' in workflow_text
    databases_assignment = next(
        statement
        for statement in test_settings.body
        if isinstance(statement, ast.Assign)
        and any(
            isinstance(target, ast.Name) and target.id == 'DATABASES'
            for target in statement.targets
        )
    )
    default_database = next(
        value
        for key, value in zip(databases_assignment.value.keys, databases_assignment.value.values)
        if isinstance(key, ast.Constant) and key.value == 'default'
    )
    test_database = next(
        value
        for key, value in zip(default_database.keys, default_database.values)
        if isinstance(key, ast.Constant) and key.value == 'TEST'
    )
    test_name = next(
        value
        for key, value in zip(test_database.keys, test_database.values)
        if isinstance(key, ast.Constant) and key.value == 'NAME'
    )
    assert isinstance(test_name, ast.Call)
    assert isinstance(test_name.func, ast.Name) and test_name.func.id == 'config'
    assert len(test_name.args) == 1
    assert isinstance(test_name.args[0], ast.Constant)
    assert test_name.args[0].value == 'POSTGRES_TEST_DB'
    bootstrap_index = next(index for index, step in enumerate(steps) if '001_roles.sh' in step)
    makemigrations_index = next(
        index for index, step in enumerate(steps) if 'makemigrations --check --dry-run' in step
    )
    migration_index = next(
        index
        for index, step in enumerate(steps)
        if 'manage.py migrate --settings=config.settings.migration' in step
        and 'migrate --check' not in step
    )
    pytest_index = next(index for index, step in enumerate(steps) if 'python -m pytest -v' in step)
    assert bootstrap_index < makemigrations_index < migration_index < pytest_index
    assert 'CREATE DATABASE %I OWNER %I' in roles_script
    assert '--set test_db="${POSTGRES_TEST_DB}"' in roles_script
    test_database_bootstrap = re.search(
        r'(?ms)^psql --set ON_ERROR_STOP=1 \\\r?\n'
        r'(?:.*\r?\n)*?'
        r'  --dbname "\$\{POSTGRES_TEST_DB\}" \\\r?\n'
        r"  --set test_user=\"\$\{POSTGRES_TEST_USER\}\" <<'SQL'\r?\n"
        r'(?P<sql>.*?)^SQL$',
        roles_script,
    )
    assert test_database_bootstrap, (
        'bootstrap do banco de testes não delimitado pelo segundo heredoc psql'
    )
    test_database_sql = test_database_bootstrap.group('sql')
    assert (
        "SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), "
        ":'test_user') \\gexec"
    ) in test_database_sql
    assert (
        "SELECT format('GRANT USAGE, CREATE ON SCHEMA public TO %I', :'test_user') \\gexec"
    ) in test_database_sql
    assert "NOBYPASSRLS NOCREATEDB', :'test_user'" in roles_script
