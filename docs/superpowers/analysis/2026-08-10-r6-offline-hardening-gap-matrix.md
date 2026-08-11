# R6 Hardening — Matriz de gaps e migração segura

**Base comparada:** especificação normativa imutável `4ec4601` (`blob 464b85d84f015825e7af079d5f8db3c9961f5220`, arquivo `docs/superpowers/specs/2026-07-16-sprint-6-pdv-offline-sync-design.md`) contra o estado atual do `master` (`a36c8ee`). O arquivo normativo não está materializado neste branch; o commit/blob é a referência reproduzível. A especificação divergente de 17/07 fica apenas como contexto histórico.

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

1. **Adquirir exclusão mútua por arquivo e conexão.** Antes de abrir o legado, obter lock exclusivo; impedir duas migrações/instâncias do PDV simultâneas e detectar lock ocupado sem sobrescrever.
2. **Fazer checkpoint consistente do WAL.** Com a conexão exclusiva aberta, executar `PRAGMA wal_checkpoint(TRUNCATE)` somente após confirmar que não há outra conexão; copiar o conjunto `.db`, `-wal` e `-shm` para backup identificado. Se o checkpoint não for seguro, preservar os três arquivos e abortar de forma fail-closed.
3. Criar `operation_journal_v3` e `journal_migrations` dentro de uma transação SQLite; persistir fases `backup_created`, `schema_created`, `rows_copied`, `validated` e `activated` com contagens e hashes.
4. Copiar cada linha legada como evento preservado, mantendo `legacy_id`, payload bruto e hash calculado do payload exatamente como lido. O backup deve permitir restauração sem depender do schema novo.
5. Atribuir `local_sequence` somente quando `device_id`, `tenant_id` e a ordenação forem determináveis. Linhas sem identidade suficiente ficam em `migration_review`, não sincronizam e aparecem em exportação/reconciliação administrativa.
6. Mapear `sale:create` para `offline.sale.completed` apenas quando o payload contiver os campos mínimos da venda. `cash-session:open` e `cash-session:close` não serão convertidos em operações offline aceitas; permanecem auditáveis como legado incompatível.
7. Não importar estados derivados como decisão de conflito. Status legado `conflict` vira `conflict_requires_review`; `synced` vira projeção informativa, sem remover o evento.
8. Só trocar o ponteiro ativo para o schema novo após validar contagem, hashes, unicidade e leitura de amostra. Em qualquer erro ou queda, retomar pela fase persistida; se a validação falhar, manter o legado intacto e bloquear novas vendas financeiras offline até reconciliação.
9. A limpeza futura será apenas de projeções/artefatos explicitamente descartáveis; eventos originais permanecerão retidos conforme a política de auditoria.

## Fluxo operacional de eventos legados sem identidade

- Exportar o evento bruto, seu `legacy_id`, hash, valor, data, tipo e motivo da pendência para uma tela/arquivo de reconciliação administrativa.
- Bloquear somente novas conclusões offline que possam gerar efeito financeiro enquanto existir evento legado financeiro sem identidade; leitura do carrinho, catálogo e consulta de pendências continuam disponíveis.
- Gerente/admin confirma a associação correta de tenant, dispositivo, filial e caixa, ou marca o evento como não reconciliável com justificativa auditada.
- A confirmação gera evento de correção append-only e libera a sincronização/reconciliação daquele item; nunca altera o payload legado.
- Exportação e confirmação são idempotentes e repetíveis após reinício ou queda durante a migração.

## Decisões fechadas do protocolo batch

- **Resultado parcial:** o batch é aceito atomicamente como envelope e cada evento recebe resultado independente; eventos válidos podem ser aplicados, conflitos ficam registrados e eventos posteriores não são descartados silenciosamente.
- **Sequência:** toda sequência recebida é registrada no envelope, inclusive a que resulta em conflito. Uma sequência conflitante não é aplicada financeiramente, mas bloqueia avanço automático até decisão backend quando houver lacuna, duplicidade ou ordem inválida.
- **Unicidades:** `event_id` é único por dispositivo; `(device_id, local_sequence)` é único; `idempotency_key` é único por tenant/dispositivo; `batch_hash` identifica o conteúdo canônico do envelope. Reuso com payload diferente retorna conflito de idempotência.
- **Canonicalização:** JSON UTF-8 com chaves ordenadas, sem espaços insignificantes, números em representação decimal canônica e timestamps ISO-8601 UTC; hash SHA-256 em hexadecimal minúsculo.
- **Replay divergente:** mesmo batch/hash retorna o resultado persistido; mesmo identificador com hash diferente é `idempotency_conflict` e nunca é reaplicado.
- **Limite:** zero eventos é rejeitado; 1–50 eventos é permitido; acima de 50 é rejeitado antes de efeitos financeiros.

## Âncora temporal e comportamento fail-closed

- Cada validação online bem-sucedida persiste `server_time`, `client_wall_time`, `monotonic_elapsed` quando disponível e `last_online_at`.
- Durante a execução, limites usam relógio monotônico; após reinício, usam a diferença entre o relógio de parede e a âncora do servidor.
- Retrocesso do relógio local, âncora ausente, âncora inválida ou diferença impossível de validar tornam novas conclusões offline bloqueadas; pendências existentes continuam visíveis e sincronizáveis.
- A validade de preço é calculada contra a âncora temporal confiável, nunca somente contra `Date.now()` sem validação.
- Reconexão atualiza a âncora antes de liberar nova contingência; toda violação fica auditada com motivo e horário observado.

## Testes BDD obrigatórios antes da implementação produtiva

1. **Given** nenhum journal legado, **when** o app inicializa, **then** cria schema v3 vazio e marca a migração como `activated`.
2. **Given** legado íntegro sem WAL, **when** migra, **then** cria backup, copia todas as linhas, valida contagem/hash e ativa v3 sem apagar o legado.
3. **Given** legado com WAL pendente, **when** migra sob lock exclusivo, **then** incorpora o WAL por checkpoint consistente e o backup contém o estado completo.
4. **Given** migração interrompida em cada fase, **when** o app reinicia, **then** retoma ou reverte de modo idempotente sem duplicar eventos nem ativar schema incompleto.
5. **Given** payload legado corrompido, **when** a validação roda, **then** preserva o bruto, marca `migration_review`, bloqueia sync financeiro e não perde o restante do journal.
6. **Given** evento sem tenant/device/ordenação determináveis, **when** migra, **then** exporta para reconciliação administrativa e não sincroniza automaticamente.
7. **Given** relógio local retrocedido ou âncora temporal ausente, **when** o operador tenta concluir offline, **then** a venda é bloqueada fail-closed com motivo auditável.

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
