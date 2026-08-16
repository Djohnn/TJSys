# Matriz de reconciliação R0–R4

Baseline de integração isolada levantada em 2026-08-16 a partir de `8636cf1`.
Esta matriz registra proveniência e decisão; não incorpora alterações do checkout
raiz. As evidências de execução da Task 3 ficam registradas abaixo.

| Functional unit | Source path | Candidate source | Decision | Evidence |
|---|---|---|---|---|
| R0 — baseline e governança visual | `frontend/e2e/r0-baseline-e-governanca-do-design-system.spec.ts`; `frontend/src/styles/designGovernance.test.ts`; `frontend/scripts/check-design-tokens.mjs`; `docs/02_Architecture/design-system/reference/` | `bb375bd` e commits R0 ancestrais (`eafd6eb`, `a2ef360`, `b9573c0`, `d04232f`) | incorporate | Somente os cinco commits finais R0 foram reaplicados sobre `df579cd`; `bb375bd` acrescenta a asserção visual, e os demais fornecem contrato, assets, hashes, índice e regra de cores literais. A cadeia anterior de R1+ não foi incorporada. |
| R0 — índice do manifest | `docs/DOCUMENT_INDEX.md` | `d04232f` (`test(r0): close visual acceptance`) | incorporate | A linha `DESIGN-SYSTEM-MANIFEST` foi incorporada como parte da governança R0; não representa o conteúdo ancestral de R1. |
| R1 — tokens e componentes fundamentais | `frontend/src/design-system/tokens.ts`; `frontend/src/styles/tokens.css`; `frontend/src/components/ui/{Button,Input,Select,Textarea,Switch,Tabs,Alert,Card,Badge,Modal,Table,Logo}.tsx`; `frontend/src/components/ui/designSystem.test.tsx`; `frontend/src/main.tsx`; `frontend/public/assets/brand/`; `frontend/eslint.config.js`; `frontend/e2e/r1-tokens-e-componentes-fundamentais.spec.ts`; `frontend/package.json`; `frontend/package-lock.json`; `frontend/src/test/setup.ts`; `docs/DOCUMENT_INDEX.md` | `bb375bd..a8d447d` + commits Task 3 `0f085bb`, working implementation | incorporate | Contrato R1 completo implementado após RED: tokens semânticos correspondentes CSS/TS, primitives nomeados/default, labels/erro/foco/teclado, Modal nomeado com Escape/trap/retorno, logos preservados por SHA-256 e lint flat restaurado de `e7a0a8a`. Fixture visual R1 permanece deferida à R2/Task4; ProductStockFields/inventoryApi permanecem intocados e deferidos à R3/Task5. |
| R2 — shell, navegação e responsividade | `frontend/e2e/r2-shell-navegacao-e-responsividade.spec.ts` | `a987407` (`fix(r2): add mobile viewport drawer test to E2E`) | retain-for-later | O merge candidato contém essa ancestralidade, mas a tarefa é limitada a R0/R1; alterações R2 foram explicitamente excluídas da árvore final. |
| Deferimento R2/Task4 — retries visuais | `frontend/playwright.config.ts: retries CI` | configuração atual | retain-for-later | Corrigir em R2/Task4 para retries `0`; este deferimento não é passe final. |
| Deferimento R2/Task4 — execução visual multi-browser | `.github/workflows/e2e.yml` browser install/run + snapshots multi-browser | workflow atual | retain-for-later | Decidir e alinhar instalação, execução e snapshots multi-browser em R2/Task4; este deferimento não é passe final. |
| Deferimento R2/Task4 — teclado/foco | contrato de teclado e foco do design system | escopo R2 | retain-for-later | O teste R0 declara somente accessibility; teclado/foco pertence a R2/Task4 e não é considerado passe R0. |
| R3 — verificação de sprint e configuração Playwright | `CHECKPOINT-R3.md`; `frontend/playwright.config.ts`; specs R0–R2 | `2c4c945` (`chore(r3): close sprint verification`) | retain-for-later | O merge candidato contém essa ancestralidade, mas a tarefa é limitada a R0/R1; alterações R3 foram explicitamente excluídas da árvore final. |
| R4 — produto/custo/margens e autenticação MFA | `frontend/e2e/r4-produto-custo-varejo-atacado-e-margens.spec.ts`; auth | `ee10b3a` (`fix(r4): stabilize MFA E2E authentication`) | retain-for-later | O merge candidato contém essa ancestralidade, mas a tarefa é limitada a R0/R1; alterações R4 foram explicitamente excluídas da árvore final. |
| Linha de integração | branch `codex/r0-r4-consolidation` na worktree dedicada | `master` em `8636cf18066a7586fe8f1d67e08186731621cbe2` | incorporate | Worktree criada em `8636cf1`; R0 foi consolidado anteriormente e R1 é integrado nesta task a partir de `a8d447d`. |
| Estado publicado de referência | `origin/master` | `c3653ea876f200c68fc2892095503439fe8ce1d2` | already-represented | Ref existe, mas não é a base solicitada; a integração usa o `master` local exato `8636cf1`. |
| Fixture canônica de regressão visual R0 | `frontend/e2e/r0-baseline-e-governanca-do-design-system.spec.ts-snapshots/r0-baseline-e-governanca-do-design-system-chromium-win32.png` | `2c4c945` (`chore(r3): close sprint verification`) | incorporate | O blob versionado foi restaurado path-scoped de `2c4c945` após o merge R0; o spec chama `expect(page).toHaveScreenshot('r0-baseline-e-governanca-do-design-system.png')`. O fixture é canônico e versionado; `playwright-report`, `test-results` e demais outputs continuam generated/runtime. |
| Fixtures canônicas de regressão visual R1/R2 | `frontend/e2e/r1-tokens-e-componentes-fundamentais.spec.ts-snapshots/r1-tokens-e-componentes-fundamentais-chromium-win32.png`; `frontend/e2e/r2-shell-navegacao-e-responsividade.spec.ts-snapshots/r2-shell-navegacao-e-responsividade-chromium-win32.png` | `2c4c945` | retain-for-later | As chamadas normativas são `expect(page).toHaveScreenshot('r1-tokens-e-componentes-fundamentais.png')` e `expect(page).toHaveScreenshot('r2-shell-navegacao-e-responsividade.png')`; permanecem fora do boundary R1/Task3. |
| Deferimento R3/Task5 — inconsistência de baseline de typecheck | `frontend/src/catalog/ProductStockFields.tsx`; `frontend/src/inventory/inventoryApi.ts` | ancestralidade `b7eb769`/`e7a0a8a` | retain-for-later | `git diff df579cd..88d1196` não contém esses caminhos; `git log -S "fetchBranches" --all -- frontend/src/inventory/inventoryApi.ts` aponta commits R8/estado anterior. O typecheck falha por `fetchBranches`/`fetchStockLocations` ausentes, sem causalidade R0; corrigir em R3/Task5. Task9 exige zero falhas; este deferimento não é passe final. |
| Grafo incremental do checkout raiz | `graphify-out/graph.json` | linha untracked em `C:\ERP` (`graphify-out/graph.json merge=graphify`) | retain-for-later | Não incorporado nesta task; pertence à classificação do checkout raiz e permanece fora da integração R0/R1 isolada. |

## Registro da consolidação R1

* **Proveniência:** `bb375bd..a8d447d` fornece o slice R1 original; `0f085bb` registra o RED completo; `01809ab` registra o RED específico de governança `critical/module` e classes legadas; as correções GREEN ficam nos commits `2eaafebe` e no commit seguinte desta task.
* **Arquivos integrados:** `docs/DOCUMENT_INDEX.md`; `frontend/package.json`; `frontend/package-lock.json`; `frontend/eslint.config.js`; `frontend/src/main.tsx`; `frontend/src/components/ui/{Button,Input,Select,Textarea,Switch,Tabs,Alert,Card,Badge,Modal,Table,Logo}.tsx`; `frontend/src/components/ui/designSystem.test.tsx`; `frontend/src/design-system/tokens.ts`; `frontend/src/styles/tokens.css`; `frontend/src/test/setup.ts`; `frontend/public/assets/brand/logo_fundo_azul.png.png`; `frontend/public/assets/brand/logo_fundo_branco.png.png`; `frontend/e2e/r1-tokens-e-componentes-fundamentais.spec.ts`.
* **Conflitos:** nenhum. O merge automático foi concluído com `git merge --no-ff --no-commit a8d447d`; não foram usados `ours`/`theirs` globais.
* **Decisões:** consumidores existentes mantêm APIs; todos os primitives têm export nomeado/default; `Input`, `Select` e `Textarea` geram IDs estáveis e associam erros; `Modal` usa dialog nomeado, `aria-modal`, Escape, foco inicial, trap básico e retorno; logos são servidos em paths estáveis e preservam os hashes do manifest; `critical-900/800/100` e `module.vendas/financeiro/compras/estoque/fiscal/pessoas/relatorios/admin` seguem exatamente a paleta normativa; Card/Badge/Table usam somente referências `var(--...)` dos tokens, sem classes cromáticas Tailwind legadas. Componentes/contratos de R2–R4, fixture R1 e typecheck de `ProductStockFields`/`inventoryApi` não entram nesta consolidação.
* **Lint:** `frontend/eslint.config.js` foi restaurado de `e7a0a8a` após inspeção; é flat ESLint 10 genérico e não contém comportamento R2+. Resultado: zero errors e quatro warnings preexistentes em React Hook Form.

## Impeccable — audit/polish R1

* **Comandos:** não há executável `impeccable` nem comandos `$impeccable audit`/`$impeccable polish` disponíveis neste ambiente. `context.mjs` reportou `NO_PRODUCT_MD`, `PRODUCT_INIT_REQUIRED` e `MANUAL_DETECTOR_REQUIRED`; o contexto foi carregado uma vez conforme a skill.
* **Detector mecânico (output bruto):** `node C:\ERP\.agents\skills\impeccable\scripts\detect.mjs --json frontend/src/design-system frontend/src/components/ui frontend/src/styles/tokens.css frontend/src/main.tsx frontend/public/assets/brand` → `[]` (exit `0`).
* **Audit manual:** sem HEX nos componentes; labels/erro/`aria-describedby`, foco visível, targets mínimos `44px`, estados disabled/loading/error e teclado foram verificados nos primitives; Modal cobre dialog nomeado, Escape, trap básico e retorno; logos têm alt e hashes normativos. A fixture visual R1 permanece deferida conforme Task4.
* **Polish manual:** detector inicialmente apontou `Tabs.tsx:49 border-b-2`; substituído por underline sem borda accent arredondada. Segunda execução retornou `[]`. Não houve snapshot, migração de páginas ou alteração R2+.

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

R0 e R1 são as unidades marcadas `incorporate`. R2–R4 e suas fixtures foram
preservados como `retain-for-later`, apesar de aparecerem na ancestralidade do
commit candidato, porque aceitar essa cadeia reclassificaria trabalho fora do
boundary. A matriz documenta essa proveniência para a próxima consolidação.
Os deferimentos para R2/Task4 e R3/Task5 são pendências explícitas, não passes
finais; a Task9 exige zero falhas antes do aceite global.
