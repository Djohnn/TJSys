# Checkpoint — Sprint R3 (Produto: identidade, mídia e EAN automático)

**Data:** 2026-08-10
**Branch:** `codex/frontend-redesign-wave-a`
**Worktree:** `C:\ERP\.worktrees\frontend-redesign-wave-a`

## Continuação verificada — 2026-08-10

- Backend R3: EAN tenant-scoped, `brand_ref`, `subcategory`, ProductCode atômico e remoção física de imagens.
- Frontend R3: barcode enviado no comando atômico; layout e fluxo de mídia preservados.
- Gate final: R0/R1/R2 + catálogo + acessibilidade `20 passed (42.1s)`; Vitest `366 passed`; backend `38 passed`; `manage.py check` sem problemas; typechecks e build verdes.
- Commits desta continuação: `662b5ce`, `b9c8a60`, `6761363`, `b8d3099`, `9ec6e77`.

## Reconciliação na linha R0–R4 — 2026-08-16

- Fonte reconciliada: `2c4c945`, aplicada sobre R0–R2 já consolidadas na branch `codex/r0-r4-consolidation`.
- Migrações foram linearizadas sobre o estado integrado: `0016_product_subcategory`, `0017_normalize_known_unit_precision`, `0018_tenant_product_code_sequence` e `0019_product_brand_ref`.
- O módulo legado `backend/inventory/services.py` foi convertido no pacote `backend/inventory/services/`, preservando as exportações existentes e incorporando o serviço de estoque da R3.
- Gates atuais: backend integrado `33 passed in 41.25s`; Vitest `25 files, 370 passed`; Playwright R3 + acessibilidade `15 passed (37.0s)`; regressão R0–R2 `5 passed (7.7s)`; build e typecheck verdes; Ruff e mypy escopados sem erros; `manage.py check` sem problemas; `makemigrations --check --dry-run` sem mudanças.
- A execução global do Ruff ainda encontra 503 erros históricos fora do slice R3. Eles permanecem dívida global e não foram misturados com esta reconciliação.

---

## Status da Sprint R3

> **Status atualizado em 2026-08-10:** Sprint R3 concluída. As Tasks 2–6 foram executadas e o gate integrado final foi aprovado com servidor externo persistente e snapshots determinísticos.

| Task | Status | Detalhes |
|------|--------|----------|
| **Task 1** — Testes RED: EAN/identidade/nicity | ✅ Concluída + Revisada | Commit `0d5df8c` + `2f03e66` |
| **Task 2** — Migration EAN/brand/subcategoria/Rls | ✅ Concluída | `662b5ce` |
| **Task 3** — Refatoração `ProductApplyView` (atomic) | ✅ Concluída | `662b5ce`, `6761363` |
| **Task 4** — API de mídia e round-trip | ✅ Concluída | `b9c8a60` |
| **Task 5** — Frontend idêntico ao redesign | ✅ Concluída | `6761363` |
| **Task 6** — E2E, acessibilidade, CI, revisão final | ✅ Concluída | `b8d3099`, `9ec6e77`, `362e831` |

\* Gates funcionais foram validados; o rerun local completo permanece pendente por dependências do ambiente.

---

## R3 Task 1 — Concluída

### Arquivo
- `backend/tests/test_product_redesign_identity.py` (RED)

### Cenários cobertos (5)
1. `test_r3_ean_auto_generated_when_barcode_empty` — barcode vazio → EAN-13 prefixo `20` (13 dígitos) **[RED legítimo]**
2. `test_r3_manual_barcode_is_persisted` — barcode manual persistido como ProductCode **[RED legítimo]**
3. `test_r3_idempotent_replay_returns_same_code` — replay com mesmo `command_id` retorna mesmo código **[PASSA — comportamento existente]**
4. `test_r3_conflict_on_mismatched_payload` — 409 quando `command_id` reusado com payload diferente **[PASSA — comportamento existente]**
5. `test_r3_ean_is_tenant_isolated` — EAN de tenant A independente de B (2 tenants reais) **[RED legítimo]**

### Resultado raw
```
3 failed (EAN auto, manual barcode, tenant isolation — feature EAN ausente)
2 passed (replay, conflict — comportamento existente preservado)
```

### Revisões
- **Revisor de Spec:** ✅ APROVADO (5 cenários, POST + HTTP_X_TENANT_ID correto)
- **Revisor de Qualidade:** ✅ APROVADO após 2 correções:
  - Cenário 5 reescrito para usar **2 tenants independentes** (isolamento real)
  - `_make_tenant()` gera slug único com `uuid4().hex[:8]` (robustez sob paralelismo)

---

## Causa raiz identificada (guia para Tasks 2–3)

O `ProductApplyView` (**`backend/catalog/views.py`**, linhas 868–964) **não cria `ProductCode`**:
- Cria `Product` mas nunca persiste código (nem auto-EAN nem manual)
- `ProductSerializer.get_barcode()` (`serializers.py` linhas 152–158) retorna `''` pois não há `ProductCode` com `code_type='ean'`
- `build_apply_product_response()` (linhas 839–865) serializa sem código

**Fix necessário na Task 2+3:** criar `ProductCode` (manual ou EAN-13 automático) **dentro da mesma transação** do `ProductApplyView`, usando sequência tenant-scoped prefixo `20`.

---

## Estado verificado dos Models (guia para Task 2)

- `Product.brand` — **ainda textual** (`CharField(max_length=120)`, linha 128)
- `Product.category` — FK para `Category` (linha 106)
- **Sem campo `subcategory`** na `Product`
- `Brand` — modelo relacional **já existe** (linha 525)
- `ProductCode` — modelo já existe (linha 220)
- `ProductApplyCommand` — já existe (linha 824)

---

## Pós-R3 / melhorias futuras

- Avaliar a futura remoção do campo textual legado `Product.brand`, mantido por compatibilidade.
- Adicionar testes explícitos de rollback/concurrency para o fluxo de identidade, se forem requisito do próximo ciclo.

---

## Commits da Sprint R3 até aqui

```
2f03e66 test(r3): fix tenant isolation to use two tenants and unique slugs
0d5df8c test(r3): define acceptance contract for product identity and atomicity
```

---

## Nota sobre ferramentas

O classificador `Comb` esteve temporariamente indisponível para `Bash`/`SendMessage` durante esta sessão, o que causou retries. Isso é transitório e não afeta o código já commitado.

---

## Próximo passo

Sprint R3 encerrada. Prosseguir para a próxima sprint; não reabrir as Tasks 2–6.
