# Backend

Monólito modular Django/DRF do TJSys. Responsável por Identity, Organizations,
Catalog, Inventory, Purchasing, Sales, Cash Management, Financial, Fiscal,
Analytics, Integrations e Audit.

- Stack: Python 3.12+, Django, Django REST Framework, PostgreSQL, Redis, Celery.
- Arquitetura: monólito modular por capability (ADR-001). Sem HTTP entre módulos.
- Multi-tenancy: PostgreSQL compartilhado com `tenant_id` obrigatório e RLS
  (ADR-002). Isolamento aplicado na aplicação e no banco.
- Eventos: Transactional Outbox (ADR-006) publicado por worker Celery.
- APIs versionadas em `/api/v1` (API-001), `X-Correlation-ID` ponta a ponta.

Consulte `../docs/` para a documentação normativa e `../README.md` para iniciar o
ambiente local.

## Banco e isolamento

O servidor Django usa `POSTGRES_APP_USER`, um papel sem privilégios para ignorar RLS. Migrations usam `config.settings.migration` e as credenciais `POSTGRES_USER`/`POSTGRES_PASSWORD` do proprietário local:

```powershell
python manage.py migrate --settings=config.settings.migration
python manage.py migrate --check --settings=config.settings.migration
```

Os testes usam `POSTGRES_TEST_USER`, que pode criar banco efêmero, mas não é superuser e não possui `BYPASSRLS`. A suíte falha se esse contrato for violado.

## Identity e acesso

- autenticação web por sessão Django e CSRF;
- cadastro público com confirmação de e-mail;
- MFA TOTP ou e-mail conforme política do tenant;
- códigos de recuperação de uso único;
- recuperação de senha com resposta não enumerável e revogação de sessões;
- convites, memberships e autorização centralizada por capability;
- administradores precisam de MFA validado para endpoints tenant-scoped.

Desenvolvimento usa backend de e-mail console e testes usam memória. Produção exige
SMTP e `MFA_ENCRYPTION_KEY` fornecidos por variável de ambiente.
