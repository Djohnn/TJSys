from .local import *

FISCAL_PROVIDERS = {
    'plugnotas': {
        'class': 'fiscal.adapters.fake.DeterministicFiscalAdapter',
        'api_key': '',
    },
}
