# Sprint 8 — Piloto, Observabilidade e Hardening Design

## Objetivo

Preparar o TJSys para um piloto controlado em 1 a 2 lojas, com segurança, operação, suporte, restauração e rollback verificáveis antes de qualquer uso real assistido.

## Escopo

Esta sprint não adiciona grandes fluxos comerciais. Ela transforma o conjunto já implementado em uma release candidata operável: métricas, alertas, dashboards, runbooks, backup/restore, smoke tests, checklist de segurança, evidências de performance e critérios de rollback.

## Arquitetura

A abordagem será incremental e pragmática:

- manter o monólito modular Django e o PDV Electron já existentes;
- instrumentar pontos críticos sem alterar regras de negócio;
- registrar métricas e checks em arquivos/scripts versionados;
- criar runbooks claros para incidentes, restauração e suporte;
- provar os gates em ambiente local/staging antes do piloto.

## Componentes

- `backend/config/`: health checks, correlation ID, readiness e configurações de observabilidade.
- `backend/outbox/`: métricas e alerta de backlog/idade de mensagens.
- `backend/fiscal/`: métricas de rejeição, erro técnico e pendência fiscal.
- `pdv/`: smoke visual e status de sincronização/offline.
- `infra/`: scripts de backup, restore e verificação.
- `docs/09_Operations/`: runbooks, SLOs e matriz de incidentes.
- `docs/10_Releases/`: relatório final da release candidata.

## Regras e decisões

- Nenhum segredo real será documentado, versionado ou exposto em log.
- SLO inicial será medido, não prometido comercialmente.
- Alertas devem diferenciar falha técnica, rejeição de negócio e indisponibilidade externa.
- Backup só será aceito com restauração testada.
- Rollback precisa ter critério objetivo: erro crítico, perda de sincronização, falha fiscal sistêmica ou risco de dados.
- Piloto só inicia com checklist assinado no PRD e relatório final.

## Entregáveis

- Dashboard operacional mínimo.
- Smoke tests automatizados para backend, frontend/PDV e fiscal mockado.
- Script de backup e restore testado.
- Runbooks de incidentes SEV-1 a SEV-4.
- Checklist de segurança e privacidade.
- Relatório final de release candidata.

## Fora do escopo

- Refazer arquitetura de observabilidade completa com stack externa obrigatória.
- Garantir SLO comercial definitivo.
- Publicar produção real sem aprovação manual.
- Criar novas features comerciais.

## Critérios de aceite

- Health/readiness expõem dependências críticas.
- Outbox, fiscal e PDV têm indicadores verificáveis.
- Restore é executado e evidenciado.
- Smoke test falha quando dependência crítica simulada cai.
- Runbooks cobrem incidentes, rollback e comunicação.
- Scanner simples não encontra segredos versionados.
