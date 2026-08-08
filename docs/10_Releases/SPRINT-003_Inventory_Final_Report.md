# Sprint 3 — Estoque e Movimentações — Relatório Final

Data da revisão: 2026-07-17

## Resultado desta rodada

A Sprint 3 estava em estado parcial, com APIs não importáveis, serializers apontando para campos inexistentes e rotas não registradas. O hardening desta rodada estabilizou o núcleo técnico do módulo `inventory` para permitir evolução segura nas próximas tarefas.

Correções aplicadas:

- models de estoque alinhados ao contrato usado pelos serializers e services;
- `version` adicionado às entidades de estoque;
- `branch` e `actor` adicionados a `StockOperation`;
- serializers corrigidos para campos existentes e validação por `full_clean()`;
- `inventory.permissions` criado;
- `inventory.urls` criado e incluído em `config.urls`;
- views reescritas sem relações inexistentes e com querysets tenant-scoped;
- `StockMovement` e `StockBalance` expostos como somente leitura;
- services simplificados para recibo, saída, ajuste, transferência, reversão, reserva e saldo;
- testes de hardening adicionados para importação, serializers e rotas.

## Evidências

Comandos executados com sucesso:

```text
C:\ERP\.venv\Scripts\python.exe manage.py check
Resultado: System check identified no issues (0 silenced).
```

```text
C:\ERP\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run
Resultado: No changes detected.
```

```text
C:\ERP\.venv\Scripts\python.exe manage.py migrate --settings=config.settings.migration
Resultado: inventory.0002, inventory.0003 e inventory.0004 aplicadas com sucesso.
```

```text
C:\ERP\.venv\Scripts\python.exe -m ruff check inventory tests/test_inventory_api_hardening.py tests/test_inventory_capabilities.py tests/test_stock_locations.py tests/test_stock_lots.py
Resultado: All checks passed!
```

```text
C:\ERP\.venv\Scripts\python.exe -m pytest tests/test_inventory_api_hardening.py tests/test_inventory_capabilities.py -q -o addopts=''
Resultado: 29 passed, 1 warning.
```

```text
C:\ERP\.venv\Scripts\python.exe -m pytest tests/test_stock_locations.py tests/test_stock_lots.py --collect-only -q -o addopts=''
Resultado: 7 tests collected.
```

```text
C:\ERP\.venv\Scripts\python.exe -m pytest tests/test_inventory_api_hardening.py tests/test_inventory_capabilities.py tests/test_stock_locations.py tests/test_stock_lots.py -q -o addopts=''
Resultado: 36 passed, 1 warning.
```

## Correção do timeout dos testes com banco

A execução dos testes com banco travava durante o setup do pytest-django. A investigação com `faulthandler` mostrou que o processo ficava preso na preparação/conexão do banco de teste.

Causas encontradas:

- `config.settings.test` apontava `NAME` diretamente para `test_tjsys`; o Django tentava criar `test_test_tjsys`.
- Após corrigir o nome, o banco `test_tjsys` existia mas não estava migrado.
- Após aplicar migrations com o owner correto, o usuário runtime/teste não tinha DML nas tabelas criadas pelo owner.

Correções aplicadas:

- `config.settings.test` voltou a usar `POSTGRES_DB` como banco base e `TEST.NAME=POSTGRES_TEST_DB`.
- `OPTIONS.connect_timeout=5` foi adicionado para transformar esperas infinitas em erro explícito.
- `tests/conftest.py` passou a usar o banco de teste pré-provisionado e garantir grants DML para o usuário runtime/teste.
- O banco `test_tjsys` foi migrado com `config.settings.migration`.

Também foi confirmado que `manage.py migrate` com o usuário runtime falha por ausência de permissão DDL no schema `public`; a aplicação correta é via `config.settings.migration`, coerente com a estratégia de owner separado.

## Fechamento funcional da Sprint 3

As pendências funcionais foram endereçadas na rodada de fechamento:

- lote obrigatório para produto configurado com `requires_lot`;
- validade obrigatória para produto configurado com `requires_expiry`;
- bloqueio de movimentação comum de lote vencido;
- baixa administrativa autorizada de lote vencido via ajuste auditado;
- `Idempotency-Key` obrigatório nas APIs de escrita;
- replay idêntico retorna a operação original;
- replay com mesmo header e payload diferente retorna conflito `409`;
- baixa e transferência impedem saldo negativo;
- transferência é transacional e preserva rollback integral;
- reversão compensatória é única;
- RLS habilitado e forçado em tabelas tenant-scoped do inventory;
- recursos fora do tenant retornam `404`;
- reconciliação compara saldos projetados versus ledger sem correção silenciosa;
- endpoints, idempotência e eventos documentados em `docs/05_API/API-Inventory-Sprint-3.md`;
- suíte ampliada com domínio, API e RLS.

Evidências adicionais:

```text
C:\ERP\.venv\Scripts\python.exe -m pytest tests/test_inventory_closure.py tests/test_inventory_api_closure.py tests/test_inventory_security_closure.py -q -o addopts=''
Resultado: 12 passed, 3 warnings.
```

## Pre-flight para Sprint 4

Em 2026-07-17, após revisão das Sprints 0 a 3, foram corrigidas pendências de qualidade antes de avançar para vendas/caixa:

- setup de testes PostgreSQL pré-provisionado passou a reiniciar dados de aplicação no início da sessão;
- erros de teardown em `contenttypes`/`auth_permissions` nos testes transacionais foram eliminados;
- erros de `mypy` em `inventory` foram corrigidos;
- utilitários de configuração/health check ganharam cobertura adicional;
- PRD e relatórios foram alinhados ao estado real.

Gate final executado:

```text
C:\ERP\.venv\Scripts\python.exe -m pytest -q
Resultado: 192 passed, 3 warnings, cobertura total 80.19%.
```

```text
C:\ERP\.venv\Scripts\python.exe -m ruff check .
Resultado: All checks passed!
```

```text
C:\ERP\.venv\Scripts\python.exe -m mypy .
Resultado: Success: no issues found in 128 source files.
```

```text
C:\ERP\.venv\Scripts\python.exe manage.py check
Resultado: System check identified no issues (0 silenced).
```

```text
C:\ERP\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run
Resultado: No changes detected.
```

```text
python manage.py check --deploy com settings de produção e placeholders seguros
Resultado: System check identified no issues (0 silenced).
```

```text
git grep de padrões comuns de segredo
Resultado: sem ocorrências.
```

## Status

Status técnico: núcleo de inventory carregável, lint limpo, serializers, rotas, serviços idempotentes, RLS e reconciliação estabilizados.

Status da Sprint 3: concluída localmente e preparada para PR/CI remota. Sprint 4 pode ser detalhada após validação da branch no GitHub.
