# Sprint 005 — PDV Electron Online — Relatório Final

**Data:** 2026-08-10
**Status:** Aceitação local e validação backend concluídas; E2E live pendente por ambiente/credenciais

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

Os seguintes resultados foram obtidos nesta sessão no worktree R5:

```text
Vitest: 27 arquivos, 192 testes passed
Typecheck PDV: exit 0
Lint: 0 errors, 46 warnings
Build Electron: main/preload/client ✓
Typecheck E2E: exit 0
Playwright mock: 7 passed, exit 0
Porta 5173 após E2E: liberada
git diff --check: sem saída
```

Os 46 avisos do lint não bloquearam o gate; não foram tratados como erros de compilação ou falhas de teste.

O Graphify não foi atualizado nesta etapa porque o executável local retornou `Access denied`/`Acesso negado`. Isso foi registrado como limitação de ferramenta, não como evidência de falha funcional.

## Validação backend e modo live

Os checks backend foram executados com o runtime Python funcional fora do sandbox:

```text
manage.py check: exit 0 (0 issues)
makemigrations --check --dry-run: exit 0 (No changes detected)
tests/test_session_auth.py::test_verified_login_creates_only_pre_mfa_session: 1 passed
tests/test_session_auth.py tests/test_sales_api.py tests/test_web_sales_financial_api.py: 44 passed in 66.05s
```

Assim, este relatório não declara aprovação dos checks backend nem de um ambiente live. Para executar E2E live, configurar explicitamente:

```powershell
$env:E2E_LIVE_PDV = "1"
$env:E2E_LIVE_BASE_URL = "https://<ambiente-pdv>"
$env:E2E_LIVE_API_KEY = "<chave-de-teste>"
```

O fluxo mockado não exige credenciais reais. A chave live deve permanecer somente em variável de ambiente/segredo de CI.

## Aceitação e pendências

A aceitação local do pacote Electron online e a validação backend selecionada estão concluídas. A validação E2E live permanece pendente apenas por exigir ambiente e credenciais de teste reais.

Próximos limites de produto:

- R6: offline completo, fila e sincronização robusta;
- R7: fiscal;
- sprint posterior: maquineta.

Nenhum código de produção foi alterado nesta Task 4; foram produzidos apenas este relatório e a entrada correspondente no índice documental.
