# Sprint 005 — PDV Electron Online — Relatório Final

**Data:** 2026-08-10
**Status:** Aceitação local concluída; validação backend/live pendente

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

Os checks backend previstos foram tentados, mas não concluídos neste ambiente. O Python disponível (`C:\Program Files\PyManager\python.exe`) falhou antes de iniciar o Django/Pytest:

```text
[ERROR] INTERNAL ERROR: PermissionError: [WinError 5] Acesso negado: 'C:\Users\johnn\AppData\Local\Python'
CHECK_EXIT=1
MIGRATIONS_EXIT=1
PYTEST_EXIT=1
```

Assim, este relatório não declara aprovação dos checks backend nem de um ambiente live. Para executar E2E live, configurar explicitamente:

```powershell
$env:E2E_LIVE_PDV = "1"
$env:E2E_LIVE_BASE_URL = "https://<ambiente-pdv>"
$env:E2E_LIVE_API_KEY = "<chave-de-teste>"
```

O fluxo mockado não exige credenciais reais. A chave live deve permanecer somente em variável de ambiente/segredo de CI.

## Aceitação e pendências

A aceitação local do pacote Electron online está concluída: contratos tipados, cache de catálogo, isolamento tenant, gates TypeScript/build, suíte Vitest e E2E mockado foram verificados com os resultados acima. A validação backend/live permanece uma pendência operacional por indisponibilidade do runtime Python e de credenciais/ambiente live neste contexto.

Próximos limites de produto:

- R6: offline completo, fila e sincronização robusta;
- R7: fiscal;
- sprint posterior: maquineta.

Nenhum código de produção foi alterado nesta Task 4; foram produzidos apenas este relatório e a entrada correspondente no índice documental.
