# Sprint 30 — Catalog Hardening & Acceptance

**Data:** 2026-08-01  
**Status:** Aprovada localmente

## Escopo aceito

- Hub com Produtos, Serviços, Combo, Categorias, Marcas, Unidades de Medida e Impressão de Etiquetas.
- Editor responsivo no padrão B, preservando as cores Zyrp, com mídia à esquerda e identificação à direita.
- Seis etapas: Identificação, Preços, Estoque, Fiscal, Composição e Canais.
- Upload real e galeria de imagens; limite de 5 MB e validação de tipo.
- Categorias, marcas e unidades com ações de cadastro; marcas normalizadas sem duplicidade por caixa.
- Serviços com persistência fiscal e de preço; combos; canais idempotentes; etiquetas com pré-visualização antes do download.
- Login CSRF + MFA com tenant explícito; auditoria multi-tenant de consistência.

## Evidência

- Backend: `671 passed` na regressão final (inclui contrato MFA e auditoria).
- Frontend: `326 passed`; catálogo isolado `60 passed`; TypeScript e build aprovados.
- PDV: `137 passed`.
- Playwright: `12 passed` em Chromium, Firefox e WebKit.
- Auditoria de dados: `inconsistencies=0`.

## Riscos residuais

- O bundle principal gera aviso acima de 250 kB; não bloqueia funcionalidade, mas deve ser fracionado na Sprint 31.
- A execução E2E local deve elevar `AUTH_LOGIN_RATE` e `AUTH_MFA_RATE` apenas no ambiente de automação; produção mantém os limites seguros.

## Rollback

Consultar `docs/09_Operations/CATALOG_SPRINTS_23_30_ROLLBACK.md`.
