# TJSys — Documentação

Esta pasta é a fonte oficial de verdade do TJSys, um SaaS brasileiro de gestão comercial inicialmente direcionado a casas de rações.

## Estado atual

- Fase: Documentation Foundation
- Baseline vigente: ainda não estabelecida
- Documentos novos: `v0.1.0 / Draft`
- Design aprovado: `DESIGN-FOUNDATION-001 v0.1.1 / Review`
- Código de aplicação: não iniciado

## Ordem de leitura

1. [Foundation Design](superpowers/specs/2026-07-14-enterprise-commerce-platform-foundation-design.md)
2. [Product Governance](00_Governance/PG-001_Product_Governance_v0.1.0.md)
3. [Project Charter](00_Governance/PC-001_Project_Charter_v0.1.0.md)
4. [Product Vision](01_Product/PV-001_Product_Vision_v0.1.0.md)
5. [Product Strategy](01_Product/PS-001_Product_Strategy_v0.1.0.md)
6. [Product Bible](01_Product/PB-001_Product_Bible_v0.1.0.md)
7. Documentos de arquitetura, domínio e requisitos conforme forem publicados no [índice](DOCUMENT_INDEX.md).

## Estrutura

| Diretório | Conteúdo |
|---|---|
| `00_Governance` | Governança, charter e padrões documentais |
| `01_Product` | Visão, estratégia, Product Bible e PRDs |
| `02_Architecture` | SAD, Engineering Handbook e ADRs |
| `03_Domain` | DDD, eventos e contratos entre contextos |
| `04_Requirements` | SRS e rastreabilidade |
| `05_API` | Padrões e contratos OpenAPI |
| `06_Diagrams` | Diagramas Mermaid versionáveis |
| `07_Testing` | Estratégia e catálogo de testes |
| `08_Security` | Segurança, multi-tenancy e privacidade |
| `09_Operations` | Operação, observabilidade e incidentes |
| `10_Releases` | Estratégia e artefatos de releases |
| `99_Archive` | Material histórico não normativo |
| `superpowers` | Especificações e planos de execução aprovados |

## Estados documentais

`Draft → Review → Approved → Baseline → Superseded`

Somente documentos em `Baseline` são normativos. Documentos `Draft` e `Review` orientam o trabalho, mas ainda podem mudar. Material em `99_Archive` serve apenas como evidência histórica.

## Regras essenciais

- Mudanças estruturais exigem ADR.
- Todo requisito deve possuir identificador verificável.
- Toda capability deve ser rastreável até arquitetura e testes.
- IA não integra o MVP; permanece no roadmap futuro.
- O cliente contrata e paga seu provedor fiscal no MVP.
- O PDV opera online por padrão e usa contingência offline restrita.
- A hierarquia SaaS é `Tenant → Empresa → Filial`.
