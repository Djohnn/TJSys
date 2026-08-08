# PG-001 — Product Governance

| Campo | Valor |
|---|---|
| Código | PG-001 |
| Título | Product Governance |
| Versão | 0.1.0 |
| Status | Draft |
| Autor | Arquitetura de Software |
| Aprovador | Product Owner |
| Última atualização | 2026-07-14 |
| Dependências | DESIGN-FOUNDATION-001, DOC-STD-001 |
| Documentos relacionados | PC-001, PRD-001, SAD-001, DOCUMENT_INDEX |

## 1. Objetivo

Estabelecer autoridade, responsabilidades, fluxo decisório e critérios de qualidade para evolução sustentável do TJSys.

## 2. Princípios

1. Documentação versionada é a fonte oficial da verdade.
2. Domínio e casos de uso precedem interfaces e frameworks.
3. Segurança multi-tenant é requisito arquitetural, não filtro posterior.
4. O MVP reduz escopo, nunca integridade financeira, fiscal ou de dados.
5. Decisões reversíveis são rápidas; decisões estruturais exigem evidência e ADR.
6. Nenhum fornecedor externo deve contaminar regras centrais do produto.
7. Observabilidade, testes e recuperação fazem parte da funcionalidade.

## 3. Papéis

| Papel | Responsabilidade principal |
|---|---|
| Product Owner | Prioridade, valor, escopo e aceite de produto |
| Architecture Owner | Coerência técnica, ADRs e fronteiras |
| Security Owner | Threat model, privacidade, acessos e risco residual |
| Document Owner | Integridade, versão e rastreabilidade de cada documento |
| Engineering Lead | Execução, qualidade e operação |
| Domain Reviewer | Validação de regras com especialista da área |

Uma pessoa pode acumular papéis no início, mas deve declarar o papel exercido em cada aprovação.

## 4. RACI resumido

| Decisão | PO | Architecture | Security | Engineering | Domain |
|---|---|---|---|---|---|
| Escopo/MVP | A/R | C | C | C | C |
| Arquitetura estrutural | C | A/R | C | C | I |
| Segurança e privacidade | C | C | A/R | C | I |
| Regra fiscal | C | C | C | I | A/R |
| Release | A | C | C | R | I |

`R`: responsável; `A`: accountable; `C`: consultado; `I`: informado.

## 5. Ciclo de decisão

1. Registrar problema, contexto e impacto.
2. Classificar como produto, requisito, arquitetura, segurança ou operação.
3. Comparar alternativas e custo de reversão.
4. Produzir RFC quando a decisão envolver múltiplos responsáveis.
5. Produzir ADR para decisões estruturais.
6. Atualizar documentos e rastreabilidade afetados.
7. Validar critérios de aceite.
8. Registrar no changelog e no Git.

## 6. Definition of Ready

Um item entra em execução quando possui objetivo, ator, regra de negócio, escopo, dependências, riscos, critérios de aceite e requisito identificável. Integrações externas também exigem contrato, ambiente de teste e estratégia de falha.

## 7. Definition of Done

Um item está concluído quando implementação, testes, documentação, segurança, observabilidade, migração, rollback e critérios de aceite foram verificados. Alterações multi-tenant exigem teste negativo de isolamento. Operações críticas exigem idempotência e auditoria.

## 8. Gestão de riscos

Riscos são avaliados por probabilidade, impacto e detectabilidade. Riscos críticos de isolamento, fiscal, dinheiro ou perda de venda bloqueiam release até mitigação ou aceite formal documentado.

## 9. Exceções

Exceções têm prazo, responsável, risco explícito e plano de remoção. Exceção sem data de expiração não é válida. Controles de segurança legalmente obrigatórios não podem ser dispensados por conveniência.

## 10. Cadência

- Revisão de backlog: semanal durante desenvolvimento.
- Revisão arquitetural: por milestone e antes de ADR estrutural.
- Revisão de riscos: por release.
- Revisão da documentação: a cada mudança normativa.
- Auditoria de dependências e recuperação: mensal após início da operação.

## 11. Histórico de alterações

| Versão | Data | Alteração |
|---|---|---|
| 0.1.0 | 2026-07-14 | Governança inicial do produto. |
