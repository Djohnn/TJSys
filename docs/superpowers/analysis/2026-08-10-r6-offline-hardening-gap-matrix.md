# R6 Hardening — Matriz de gaps e migração segura

**Base comparada:** especificação `docs/superpowers/specs/2026-07-16-sprint-6-pdv-offline-sync-design.md` contra o estado atual do `master` (`a36c8ee`).

**Escopo:** remediar a contingência offline já existente. Esta matriz não reabre a R6 como sprint inédita e não autoriza ainda alterações de código.

## Matriz de conformidade

| Requisito restritivo | Implementação atual | Gap | Remediação proposta | Evidência de aceite |
|---|---|---|---|---|
| Journal append-only | `operationJournal.ts` atualiza `status`, erros e resolução; `cleanup()` executa `DELETE` de eventos sincronizados | P0 — histórico pode ser alterado/removido | Separar evento imutável de projeção de status; nenhum `UPDATE`/`DELETE` no evento original. Retentativas e conflitos viram eventos/projeções derivadas | Teste tenta alterar/remover evento e comprova preservação do payload/hash original |
| Identidade do evento | Campos atuais: `uuid`, tipo, payload, idempotency key | P1 — faltam `tenant_id`, `device_id`, `branch_id`, `cash_session_id`, `operator_id`, versão e hash | Novo schema versionado com todos os campos obrigatórios e validação antes do append | Schema/constraint test + round-trip após reinício |
| Sequência monotônica | Não existe `local_sequence` | P0 — backend não consegue detectar lacuna/duplicidade por dispositivo | Sequence allocator transacional por dispositivo; incremento somente no append confirmado | Testes de sequência 1..N, reinício e concorrência |
| Limite offline de 2 horas | `connectivityMonitor` apenas informa online/offline | P0 — não há janela de contingência | Persistir `offline_started_at`; bloquear nova conclusão após 2h e manter pendências acessíveis | Testes em 1h59 permitido e 2h bloqueado |
| Preço válido por 24 horas | Cache de preço possui validade, mas journal/sale offline não valida a idade no fechamento | P0 — venda pode usar snapshot vencido | Capturar `price_snapshot_at` e bloquear conclusão quando idade exceder 24h | Testes com snapshot válido/vencido |
| Pré-condições da venda | `syncEngine.ts` aceita `cash-session:open` e `cash-session:close` na fila | P0 — abertura/fechamento offline permitidos | Remover esses tipos da contingência; somente venda/pagamento offline com caixa já aberto e operador autenticado | Testes bloqueiam abertura/fechamento sem conexão |
| Pagamentos offline | Não há contrato restrito para cash/card/Pix externo | P1 | Enum explícito: `cash`, `card_external_confirmed`, `pix_external_confirmed`; registrar confirmação externa e campos futuros | Testes de troco, valor exato e auditoria |
| Cancelamento local | Não há evento compensatório definido | P1 | Append de `offline.sale.cancelled_before_sync`; nunca apagar venda original | Teste confirma venda original + compensação |
| Sincronização em lote | `syncEngine.ts` processa cada entrada individualmente em endpoints de venda/caixa | P0 — não usa batch de até 50 | Endpoint único `/api/v1/pdv/sync-batches/`, lote máximo 50, hash e intervalo de sequência | Testes de payload, limite 50 e retry idempotente |
| Idempotência | Header individual existe, mas não há protocolo de batch/resultado por evento | P1 | `event_id` + `idempotency_key` + `batch_hash`; replay retorna resultado conhecido sem efeitos duplicados | Reenvio idêntico e payload conflitante |
| Conflitos | `conflictResolver.ts` aplica `last-write-wins`/`server-wins` localmente | P0 — decisão operacional ocorre no PDV | PDV apenas persiste `conflict_requires_review`; resolução exclusiva no backend por gerente/admin | Teste comprova que 409 não altera payload original nem resolve localmente |
| Backend sync | Não foram encontrados `PDVSyncBatch`, `PDVSyncEvent`, `PDVSyncConflict` ou `/pdv/sync-batches/` | P0 — não existe receptor do protocolo | Criar bounded context `pdv` com modelos, serviço transacional, endpoint, auditoria e outbox | API tests para tenant/device/sequência/idempotência/conflitos |
| Estoque/preço no sync | Venda individual usa endpoints atuais | P1 | Adaptador backend converte evento offline em comando de venda; estoque insuficiente vira conflito; snapshot válido é honrado | Testes de estoque insuficiente e preço alterado |
| Pendências e observabilidade | `SyncState` agregado; sem status por evento e tela restritiva | P1 | Consulta local por status, idade, sequência, erro e conflito; sync automático/manual | E2E de pendências e reconexão |

## Migração segura do SQLite já instalado

1. **Não alterar nem apagar `operation-journal.db` legado.** Criar backup lógico/arquivo antes da primeira abertura do schema novo.
2. Criar `operation_journal_v3` com os campos da especificação e um `journal_migrations`/`schema_version` separado.
3. Copiar cada linha legada como evento preservado, mantendo `legacy_id`, payload bruto e hash calculado do payload exatamente como lido.
4. Atribuir `local_sequence` somente quando `device_id`, `tenant_id` e a ordenação forem determináveis. Linhas sem identidade suficiente ficam preservadas como pendência de migração e não podem sincronizar automaticamente.
5. Mapear `sale:create` para `offline.sale.completed` apenas quando o payload contiver os campos mínimos da venda. `cash-session:open` e `cash-session:close` não serão convertidos em operações offline aceitas; permanecem auditáveis como legado incompatível.
6. Não importar estados derivados como decisão de conflito. Status legado `conflict` vira `conflict_requires_review`; `synced` vira projeção informativa, sem remover o evento.
7. Só trocar o ponteiro ativo para o schema novo após validação de contagem, hashes e unicidade. Em qualquer erro, manter o legado intacto e permitir retry da migração.
8. A limpeza futura será apenas de projeções/artefatos explicitamente descartáveis; eventos originais permanecerão retidos conforme a política de auditoria.

## Ordem de implementação recomendada

1. Schema v3, migração e testes de invariantes append-only.
2. Regras de contingência e pagamentos offline restritos no PDV.
3. Endpoint/modelos/backend batch com idempotência e conflitos auditáveis.
4. Sync automático/manual, pendências e reconexão.
5. E2E, caos de reinício/queda de energia e regressão das R3–R5.

## Decisões aprovadas

- Venda offline somente por até duas horas.
- Caixa deve estar aberto antes da queda.
- Cache de preço deve ter no máximo 24 horas.
- Lotes têm no máximo 50 eventos.
- Sequência local é monotônica por dispositivo.
- Idempotência é obrigatória.
- Conflitos são resolvidos exclusivamente no backend.
- Fiscal, TEF/maquineta e abertura de caixa offline permanecem fora do escopo.
