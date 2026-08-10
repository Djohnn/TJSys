# Checkpoint — Sprint R3 (Produto: identidade, mídia e EAN automático)

**Data:** 2026-08-09
**Branch:** `codex/frontend-redesign-wave-a`
**Worktree:** `C:\ERP\.worktrees\frontend-redesign-wave-a`

---

## Status da Sprint R3

| Task | Status | Detalhes |
|------|--------|----------|
| **Task 1** — Testes RED: EAN/identidade/nicity | ✅ Concluída + Revisada | Commit `0d5df8c` + `2f03e66` |
| **Task 2** — Migration EAN/brand/subcategoria/Rls | ⏳ **Pendente** | Próxima |
| **Task 3** — Refatoração `ProductApplyView` (atomic) | ⏳ Pendente | |
| **Task 4** — API de mídia e round-trip | ⏳ Pendente | |
| **Task 5** — Frontend idêntico ao redesign | ⏳ Pendente | |
| **Task 6** — E2E, acessibilidade, CI, revisão final | ⏳ Pendente | |

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

## Pendências de R3

- Task 2: Migration de `Product.brand` (text→FK `Brand`), adicionar `subcategory`, sequência EAN tenant-scoped, RLS.
- Task 3: `ProductApplyView` atômico (identidade + `ProductCode` na mesma transação).
- Task 4: API de mídia (upload/remoção/download `ProductImage`).
- Task 5: Frontend (refatorar `catalog/ProductEditorPage.tsx`, `catalogApi.ts` para mutation atômica).
- Task 6: E2E + acessibilidade + CI + revisão final.

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

Executar **R3 Task 2** — migration EAN/brand/subcategoria/Rls, seguida das Tasks 3–6.