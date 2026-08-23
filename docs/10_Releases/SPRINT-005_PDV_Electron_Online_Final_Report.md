# Sprint 005 — PDV Electron Online — Relatório Final

**Data:** 2026-08-16
**Status:** Implementação R5 reconciliada com R0–R4 e hardenings existentes; E2E live de desenvolvimento pendente por ambiente seedado

## Escopo aceito

R5 entrega o PDV desktop online em Electron integrado às APIs do TJSys:

- autenticação do usuário e do dispositivo, com contexto `tenant_id`;
- abertura e fechamento de caixa;
- venda balcão e recebimento;
- consulta e cache local do catálogo em SQLite, isolado por tenant;
- integração online com vendas, estoque e caixa;
- base técnica para o modo offline futuro.

Fora do escopo desta sprint:

- operação offline completa e sincronização robusta — R6;
- integração fiscal — R7;
- integração com maquineta.

## Evidências de implementação

Commits relevantes do fechamento R5:

| Commit | Evidência |
|---|---|
| `303d78e` | Fechamento dos contratos de integração Electron/IPC |
| `d1e95bd` | Persistência do contexto tenant no dispositivo |
| `267b2c3` | Isolamento e robustez inicial do cache de catálogo |
| `ffade6d` | Refresh atômico do cache |
| `6acc44a` | Proteção contra troca de tenant durante sincronização |
| `f03ca8f` | E2E PDV determinístico com mocks |
| `60d28af` | Remoção de segredo hardcoded e waits não determinísticos |
| `bc9f72e` | Encerramento limpo do servidor Playwright no Windows |
| `05a6598` | Job E2E mockado do PDV no CI |
| `a40bbfe` | Respeito à URL configurada no modo live |
| `7274c5d` | Fixture MFA alinhada ao cenário de login verificado |

## Verificação local registrada

Os seguintes resultados foram obtidos na reconciliação em `codex/r5-consolidation`:

```text
Vitest: 28 arquivos, 210 testes passed
Typecheck PDV: exit 0
Typecheck E2E: exit 0
Lint: 0 errors, 63 warnings
Build Electron: main/preload/client ✓
Playwright mock completo: 10 passed em 18.8s, retries=0
Playwright R6 focado após reconciliação: 2 passed em 7.7s, retries=0
Porta 5173 após E2E: liberada
git diff --check: sem saída
package-lock versus package.json: PACKAGE_LOCK_MISMATCHES=0
```

Os 63 avisos do lint não bloquearam o gate; não foram tratados como erros de compilação ou falhas de teste.

O Graphify não foi atualizado nesta etapa porque o executável local retornou `Access denied`/`Acesso negado`. Isso foi registrado como limitação de ferramenta, não como evidência de falha funcional.

## Validação backend e modo live

Os checks backend foram executados com o runtime Python funcional fora do sandbox:

```text
manage.py check: exit 0 (0 issues)
makemigrations --check --dry-run: exit 0 (No changes detected)
tests/test_session_auth.py::test_verified_login_creates_only_pre_mfa_session: 1 passed
tests/test_session_auth.py tests/test_sales_api.py tests/test_web_sales_financial_api.py: 44 passed in 44.44s
Ruff no arquivo backend alterado: All checks passed
mypy no arquivo backend alterado: Success: no issues found in 1 source file
```

Os gates globais de Ruff e mypy continuam vermelhos por dívida preexistente fora do escopo da R5: `ruff check .` reportou 489 erros e `mypy .` reportou 29 erros em 2 arquivos. A reconciliação não alterou esses arquivos para evitar iniciar refatoração não solicitada. O `makemigrations --check --dry-run` retornou `No changes detected`, com aviso de autenticação do PostgreSQL local ao consultar o histórico.

Os checks backend selecionados estão aprovados; este relatório não declara aprovação de um ambiente live. Para executar E2E live de desenvolvimento, usar apenas dados sintéticos e uma API key de teste dedicada:

```powershell
$env:E2E_LIVE_PDV = "1"
$env:E2E_LIVE_BASE_URL = "https://<ambiente-pdv>"
$env:E2E_LIVE_API_KEY = "<api-key-sintética-de-desenvolvimento>"
```

O fluxo mockado não exige credenciais reais. A chave live deve permanecer somente em variável de ambiente/segredo de CI.

## Aceitação e pendências

A aceitação local do pacote Electron online e a validação backend selecionada estão concluídas. A validação E2E live permanece pendente por exigir um ambiente de desenvolvimento seedado e credenciais sintéticas dedicadas; nenhum dado real é necessário. A limpeza global de Ruff/mypy permanece registrada como hardening transversal e não foi mascarada como sucesso da R5.

Próximos limites de produto:

- R6: offline completo, fila e sincronização robusta;
- R7: fiscal;
- sprint posterior: maquineta.

Nenhum código de produção foi alterado nesta Task 4; foram produzidos apenas este relatório e a entrada correspondente no índice documental.
