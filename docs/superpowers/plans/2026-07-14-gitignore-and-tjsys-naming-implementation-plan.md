# Gitignore and Zyrp Naming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Proteger arquivos locais e segredos da stack prevista e tornar Zyrp o nome oficial em toda documentação ativa.

**Architecture:** Um `.gitignore` raiz atenderá o futuro monorepositório Django, React e Electron. A renomeação será limitada a documentos ativos; o arquivo histórico manterá os textos originais, enquanto índice, changelog e manifesto serão atualizados para refletir os artefatos finais.

**Tech Stack:** Git, Django/Python, Node.js, React, Electron, SQLite, Docker, Markdown, OpenAPI YAML

---

## Mapa de arquivos

- Criar `.gitignore`: política única de exclusão do monorepositório.
- Renomear `docs/superpowers/specs/2026-07-14-enterprise-commerce-platform-foundation-design.md` para `docs/superpowers/specs/2026-07-14-zyrp-foundation-design.md`.
- Modificar documentos ativos encontrados por busca: trocar o nome comercial antigo por `Zyrp`.
- Preservar `docs/99_Archive/**`: conteúdo histórico não normativo.
- Modificar `docs/DOCUMENT_INDEX.md` e `docs/CHANGELOG.md`: registrar caminho e nomenclatura final.
- Regenerar `docs/10_Releases/MILESTONE-001_MANIFEST.txt`: atualizar inventário e SHA-256.

### Task 1: Criar a política de arquivos ignorados

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Criar o `.gitignore` raiz**

Usar seções comentadas e as seguintes regras:

```gitignore
# Environment and secrets
.env
.env.*
!.env.example
!.env.*.example
!.env.sample
!.env.*.sample
*.pem
*.key
*.p12
*.pfx
*.jks
*.keystore
secrets/
credentials/

# Python / Django
__pycache__/
*.py[cod]
*$py.class
.Python
.venv/
venv/
env/
ENV/
.pytest_cache/
.mypy_cache/
.ruff_cache/
.coverage
.coverage.*
coverage.xml
htmlcov/
.tox/
.nox/
*.egg-info/
.eggs/
build/
dist/
pip-wheel-metadata/
staticfiles/
media/
uploads/

# Django local state
local_settings.py
*.log
logs/

# Node.js / React / Electron
node_modules/
.npm/
.pnpm-store/
.yarn/cache/
.yarn/unplugged/
.parcel-cache/
.vite/
.turbo/
.next/
out/
release/
electron-dist/
*.map
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# Keep dependency lockfiles tracked
!package-lock.json
!pnpm-lock.yaml
!yarn.lock
!poetry.lock
!Pipfile.lock

# PDV local databases and runtime data
*.sqlite
*.sqlite3
*.sqlite-journal
*.sqlite-shm
*.sqlite-wal
pdv-data/
offline-data/

# Containers and local infrastructure
docker-compose.override.yml
docker-compose.override.yaml
.docker/
volumes/

# Backups, dumps and generated packages
*.bak
*.backup
*.dump
*.sql.gz
*.tar
*.tar.gz
*.tgz
*.zip

# Temporary files
tmp/
temp/
*.tmp
*.swp
*.swo
*~

# IDEs and operating systems
.idea/
.vscode/
!.vscode/extensions.json
!.vscode/settings.example.json
.DS_Store
Thumbs.db
Desktop.ini

# Local agent state
.agents/
.codex/
.worktrees/
worktrees/
```

- [ ] **Step 2: Verificar regras críticas**

Run:

```powershell
$ignored = @('.env', '.env.production', 'certificate.pfx', 'pdv.sqlite3', 'logs/app.log', 'release/app.zip')
$ignored | ForEach-Object { git check-ignore -q $_; if ($LASTEXITCODE -ne 0) { throw "Not ignored: $_" } }
$tracked = @('.env.example', 'package-lock.json', 'docs/README.md')
$tracked | ForEach-Object { git check-ignore -q $_; if ($LASTEXITCODE -eq 0) { throw "Unexpectedly ignored: $_" } }
```

Expected: exit code `0`, sem exceções.

- [ ] **Step 3: Confirmar que o ZIP atual deixa o status**

Run: `git status --short`

Expected: `Milestone_001_Documentation_Foundation_v0.1.0.zip` não aparece.

- [ ] **Step 4: Commit**

```powershell
git add .gitignore
git commit -m "chore: add repository gitignore"
```

### Task 2: Normalizar o nome oficial Zyrp

**Files:**
- Rename: `docs/superpowers/specs/2026-07-14-enterprise-commerce-platform-foundation-design.md`
- Modify: `docs/README.md`
- Modify: `docs/DOCUMENT_INDEX.md`
- Modify: `docs/00_Governance/PG-001_Product_Governance_v0.1.0.md`
- Modify: `docs/05_API/openapi.yaml`
- Modify: `docs/06_Diagrams/C4_CONTEXT.md`
- Modify: `docs/10_Releases/MILESTONE-001_Documentation_Foundation.md`
- Modify: `docs/superpowers/plans/2026-07-14-documentation-baseline-implementation-plan.md`
- Modify: renamed foundation design

- [ ] **Step 1: Renomear a especificação de fundação**

Run:

```powershell
git mv docs/superpowers/specs/2026-07-14-enterprise-commerce-platform-foundation-design.md docs/superpowers/specs/2026-07-14-zyrp-foundation-design.md
```

Expected: Git registra um rename, preservando o histórico.

- [ ] **Step 2: Substituir o nome em documentos ativos**

Substituir o nome comercial provisório por `Zyrp` apenas fora de `docs/99_Archive`. No desenho de fundação, preservar literalmente `Enterprise_Commerce_Platform_Docs` porque identifica o nome de um diretório antigo removido.

- [ ] **Step 3: Verificar ausência do nome comercial antigo no conteúdo normativo**

Run:

```powershell
$active = @('docs/00_Governance', 'docs/01_Product', 'docs/02_Architecture', 'docs/03_Domain', 'docs/04_Requirements', 'docs/05_API', 'docs/06_Diagrams', 'docs/07_Testing', 'docs/08_Security', 'docs/09_Operations', 'docs/10_Releases', 'docs/README.md', 'docs/DOCUMENT_INDEX.md', 'docs/CHANGELOG.md', 'docs/superpowers')
$legacyName = 'Enterprise' + ' Commerce Platform'
$hits = rg -n $legacyName $active
if ($LASTEXITCODE -eq 0) { throw "Old product name remains: $hits" }
```

Expected: nenhuma ocorrência.

- [ ] **Step 4: Verificar preservação histórica e do diretório legado**

Run:

```powershell
$legacyName = 'Enterprise' + ' Commerce Platform'
rg -n $legacyName docs/99_Archive
rg -n 'Enterprise_Commerce_Platform_Docs' docs/superpowers/specs/2026-07-14-zyrp-foundation-design.md
```

Expected: ambos os comandos retornam pelo menos uma ocorrência.

- [ ] **Step 5: Commit**

```powershell
git add docs
git commit -m "docs: rename product to Zyrp"
```

### Task 3: Atualizar governança do marco documental

**Files:**
- Modify: `docs/CHANGELOG.md`
- Modify: `docs/DOCUMENT_INDEX.md`
- Modify: `docs/10_Releases/MILESTONE-001_MANIFEST.txt`

- [ ] **Step 1: Registrar a mudança no changelog**

Adicionar em `2026-07-14 — Documentation Foundation v0.1.0`, na seção `Decisions`:

```markdown
- Nome oficial do produto definido como **Zyrp**; o nome provisório anterior permanece apenas no arquivo histórico.
```

- [ ] **Step 2: Atualizar o índice para o novo caminho da especificação**

Trocar o caminho de `superpowers/specs/2026-07-14-enterprise-commerce-platform-foundation-design.md` por `superpowers/specs/2026-07-14-zyrp-foundation-design.md` e o título da linha para `Zyrp Foundation Design`.

- [ ] **Step 3: Regenerar o manifesto**

Gerar as linhas ordenadas `relative_path<TAB>bytes<TAB>sha256` para todos os arquivos dentro de `docs`, excluindo apenas o próprio manifesto e o ZIP distribuível.

- [ ] **Step 4: Auditar índice, manifesto e formatação**

Run:

```powershell
git diff --check
rg -n '\b(TBD|TODO|FIXME|PLACEHOLDER)\b' docs/00_Governance docs/01_Product docs/02_Architecture docs/03_Domain docs/04_Requirements docs/05_API docs/06_Diagrams docs/07_Testing docs/08_Security docs/09_Operations docs/10_Releases
```

Expected: `git diff --check` sem erros e busca sem marcadores incompletos.

- [ ] **Step 5: Commit**

```powershell
git add docs/CHANGELOG.md docs/DOCUMENT_INDEX.md docs/10_Releases/MILESTONE-001_MANIFEST.txt
git commit -m "docs: refresh Zyrp milestone metadata"
```

### Task 4: Verificação final

**Files:**
- Verify: `.gitignore`
- Verify: `docs/**`

- [ ] **Step 1: Confirmar escopo Git**

Run:

```powershell
git status --short
git log --oneline -5
```

Expected: worktree limpa e três novos commits de implementação após o commit do plano.

- [ ] **Step 2: Confirmar o nome oficial**

Run:

```powershell
rg -n 'Zyrp' docs/README.md docs/DOCUMENT_INDEX.md docs/05_API/openapi.yaml docs/06_Diagrams/C4_CONTEXT.md
```

Expected: ocorrências em todos os arquivos informados.

- [ ] **Step 3: Confirmar proteção dos arquivos sensíveis**

Run:

```powershell
git check-ignore -v .env certificate.pfx pdv.sqlite3 Milestone_001_Documentation_Foundation_v0.1.0.zip
```

Expected: cada caminho acompanhado da regra correspondente do `.gitignore`.
