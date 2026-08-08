# Sprint 0 — Relatório Final da Fundação Técnica

Data: 2026-07-14
Estado: concluída

## Resultado

A fundação técnica do TJSys foi implementada e revalidada com Django, DRF, PostgreSQL, Redis, Celery, auditoria append-only, Transactional Outbox e isolamento multi-tenant em profundidade. O usuário de runtime do banco não possui `SUPERUSER` nem `BYPASSRLS`.

## Evidências executadas

- instalação limpa em ambiente virtual novo: Django 5.1.15 e `pip check` sem dependências quebradas;
- PostgreSQL 16 e Redis 7 saudáveis, publicados somente em `127.0.0.1` no ambiente local;
- `manage.py check`: zero problemas;
- migrations: nenhuma alteração ou migration pendente;
- suíte completa: 40 testes aprovados e 89,2% de cobertura;
- Ruff: aprovado;
- mypy: aprovado em 59 arquivos;
- `check --deploy`: zero problemas com configurações simuladas e placeholders;
- `/health/`: HTTP 200, dependências saudáveis e `X-Correlation-ID` presente;
- testes reais de leitura, escrita, ausência de contexto e IDOR entre tenants;
- Outbox idempotente, rollback transacional e alerta sanitizado de atraso/falha;
- auditoria imutável e sanitização de campos sensíveis;
- seed local exige segredo por variável de ambiente e nunca o exibe.

## Segurança de dados

Nenhuma credencial real, certificado, chave privada, dump ou banco local foi incluído no repositório. Arquivos de exemplo e CI usam apenas valores descartáveis. O baseline de detecção de segredos armazena hashes de achados revisados, não os valores originais.

## Riscos residuais

- O `pip-audit` local depende do trust store TLS da máquina; a CI Linux mantém o gate estrito.
- O Sprint 0 não inclui regras comerciais, pagamentos, emissão fiscal, PDV funcional ou IA; esses itens pertencem às próximas sprints.
- A CI remota precisa permanecer verde após cada alteração; qualquer falha reabre o aceite correspondente.

## Encerramento

O Sprint 1 não foi iniciado. Seu detalhamento e execução exigem uma decisão explícita posterior.
