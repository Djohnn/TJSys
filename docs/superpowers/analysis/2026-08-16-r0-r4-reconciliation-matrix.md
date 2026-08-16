# Matriz de reconciliação R0–R4

Baseline de integração isolada levantada em 2026-08-16 a partir de `8636cf1`.
Esta matriz registra proveniência e decisão; não incorpora alterações do checkout
raiz nem executa suites ou instalação de dependências.

| Functional unit | Source path | Candidate source | Decision | Evidence |
|---|---|---|---|---|
| R0 — baseline e governança visual | `frontend/e2e/r0-baseline-e-governanca-do-design-system.spec.ts` | `bb375bd` (`fix(r0): add visual regression screenshot assertion to e2e test`) | incorporate | `git show --stat bb375bd` registra 3 linhas adicionadas no spec; commit é ancestral direto na cadeia verificada. |
| R1 — tokens e componentes fundamentais | `frontend/e2e/r1-tokens-e-componentes-fundamentais.spec.ts`; `docs/DOCUMENT_INDEX.md` | `a8d447d` (`test(r1): close visual acceptance`) | incorporate | `git show --stat a8d447d` registra 20 linhas no spec e 2 no índice; commit é ancestral direto na cadeia verificada. |
| R2 — shell, navegação e responsividade | `frontend/e2e/r2-shell-navegacao-e-responsividade.spec.ts` | `a987407` (`fix(r2): add mobile viewport drawer test to E2E`) | incorporate | `git show --stat a987407` registra 25 adições e 2 remoções no spec; commit é ancestral direto na cadeia verificada. |
| R3 — verificação de sprint e configuração Playwright | `CHECKPOINT-R3.md`; `frontend/playwright.config.ts`; specs R0/R1/R2 e screenshots de baseline | `2c4c945` (`chore(r3): close sprint verification`) | incorporate | `git show --stat 2c4c945` registra checkpoint, configuração, três specs e três screenshots; commit é ancestral direto na cadeia verificada. |
| R4 — produto/custo/margens e autenticação MFA | `frontend/e2e/r4-produto-custo-varejo-atacado-e-margens.spec.ts`; `frontend/src/auth/AuthProvider.test.tsx`; `frontend/src/auth/authApi.ts`; `docs/DOCUMENT_INDEX.md` | `ee10b3a` (`fix(r4): stabilize MFA E2E authentication`) | incorporate | `git show --stat ee10b3a` registra 2 linhas no E2E, 15 no teste de auth, 13 na API e atualização do índice; commit é ancestral direto na cadeia verificada. |
| Linha de integração | branch `codex/r0-r4-consolidation` na worktree dedicada | `master` em `8636cf18066a7586fe8f1d67e08186731621cbe2` | retain-for-later | Worktree criada em `8636cf1`; o documento é a única alteração desta linha até o commit documental. |
| Estado publicado de referência | `origin/master` | `c3653ea876f200c68fc2892095503439fe8ce1d2` | already-represented | Ref existe, mas não é a base solicitada; a integração usa o `master` local exato `8636cf1`. |

## Evidência read-only do checkout raiz

Os comandos foram executados sem modificar `C:\ERP`. O bloco abaixo é um
snapshot checkout-sensível, capturado em uma única execução em
`2026-08-16T18:33:29-03:00` (America/Sao_Paulo); a raiz pode mudar depois da
captura e os números não devem ser tratados como estado permanente.

* `git show-ref --verify refs/heads/master` → `8636cf18066a7586fe8f1d67e08186731621cbe2`.
* `git show-ref --verify refs/remotes/origin/master` → `c3653ea876f200c68fc2892095503439fe8ce1d2`.
* `git show-ref --verify refs/heads/codex/frontend-redesign-r4` → `ee10b3a812d9892f054deb22c085a9533f3971b2`.
* Ancestralidade (`git merge-base --is-ancestor`): `bb375bd -> a8d447d`, `a8d447d -> a987407`, `a987407 -> 2c4c945` e `2c4c945 -> ee10b3a`; todos retornaram exit code `0`.
* `git check-ignore -q .worktrees` → exit code `0` (diretório ignorado).
* No mesmo script, `git -C C:\ERP status --porcelain=v1 -z -uall` foi analisado por registros NUL: **8564** entradas lógicas = **172 tracked** + **8392 untracked**. A soma confere exatamente (`172 + 8392 = 8564`).
* Categorias top-level reproduzíveis do mesmo parsing NUL (contagem de entradas lógicas): `.claude=3`, `.codex-tmp=259`, `.github=2`, `.review-49d31de=786`, `.review-task5=788`, `.superpowers=12`, `.tmp.driveupload=474`, `backend=424`, `docs=61`, `frontend=64`, `graphify-out=5636`, `infra=7`, `pdv=22`; demais categorias/arquivos de raiz somam **26** entradas (`_review_task7`, `.env.example`, `.gitattributes`, `.gitignore`, `.npm-cache-r4`, `.secrets.baseline`, `backups`, `CHECKPOINT-R3.md`, `CLAUDE.md`, `Desingn-System`, `docker-compose.e2e.yml`, `fix-tests.ps1`, `instruction-sys.md`, `mfa-qr-e2e.png`, `mfa-qr-web-admin.png`, `orientaçoes.md`, `README.md`, `recomendação.txt`, `review-5227175`, `sync.ffs_db`, `test_restore.ps1`).
* Na mesma captura, `git -C C:\ERP diff --check` reportou os erros concretos atuais: `.gitignore:133: new blank line at EOF`; `frontend/src/catalog/CatalogHomePage.tsx:22: trailing whitespace`; `frontend/src/catalog/CatalogHomePage.tsx:23: trailing whitespace`. Também emitiu avisos LF→CRLF para `backend/tests/test_product_stock_api.py`, `backend/tests/test_product_stock_control_new.py` e `backend/tests/test_product_stock_policy.py`. Esses achados são evidência do snapshot e não uma promessa de que o checkout permanecerá estático.

## Classificação

As cinco unidades funcionais R0–R4 são candidatas válidas e foram marcadas
`incorporate` porque a cadeia de commits é sequencial e o branch R4 aponta para
o último commit. A linha de integração e a referência remota foram preservadas
como evidência (`retain-for-later`/`already-represented`); não há artefatos
gerados ou candidatos inválidos nesta baseline.
