"""Share the session-scoped django_db_setup fixture with parent test suite.

pytest-django needs the custom django_db_setup (session scope) from
tests/conftest.py to handle the Windows/Postgres DB setup. Without this
conftest, pytest-django tries to create/drop the test database directly
and fails because the runtime user is not the database owner.
"""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

_conftest_path = Path(__file__).resolve().parents[2] / 'tests' / 'conftest.py'
_spec = spec_from_file_location('tests.conftest', str(_conftest_path))
_mod = module_from_spec(_spec)
_spec.loader.exec_module(_mod)

django_db_setup = _mod.django_db_setup
