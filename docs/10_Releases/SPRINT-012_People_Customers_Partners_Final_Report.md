# Sprint 12 — Pessoas, Clientes e Parceiros — Relatório Final

## Status

Concluída em 2026-08-15.

## Entregas

- App `people` tenant-scoped com PF/PJ, papéis, documentos, endereços, contatos e consentimentos.
- Normalização de CPF/CNPJ, CEP, telefone e e-mail, com unicidade de documento ativo por tenant.
- Criação e desativação lógica com auditoria e Outbox sem dados pessoais brutos.
- APIs CRUD, filtros, desativação e recursos aninhados, incluindo proteção cross-tenant.
- Cliente opcional em vendas, vínculo de fornecedor com pessoa e destinatário fiscal normalizado.

## Cenários BDD automatizados

- Given dados PF/PJ brutos, when persistidos, then identificadores são normalizados.
- Given documento ativo, when repetido, then somente o mesmo tenant é bloqueado.
- Given dados pessoais, when eventos são emitidos, then PII não aparece no payload.
- Given pessoa de outro tenant, when consultada pela API, then a resposta é 404.
- Given venda de balcão, when nenhum cliente é informado, then o fluxo anônimo permanece válido.

## Evidências

### Suíte focada (people)

```text
10 passed in 12.67s
people coverage: 95.00%
```

### Suíte completa (regressão global)

```text
406 passed in 179.89s (0:02:59)
Required test coverage of 80% reached. Total coverage: 81.72%
```

### Qualidade estática e Django

```text
pytest: 10 passed (test_people_models, test_people_services, test_people_api, test_people_integrations)
ruff: 40 errors (pre-existing, unrelated to people app — in review directories and test files)
mypy: 109 errors (pre-existing var-annotated in Django model fields across multiple apps)
Django check: System check identified no issues (0 silenced).
Migrations: No changes detected
```

## Aceite

Todos os critérios funcionais e de qualidade definidos para a Sprint 12 foram atendidos.
