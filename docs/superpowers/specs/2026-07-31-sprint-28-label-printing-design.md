# Sprint 28 — Impressão de Etiquetas

## Objetivo

Permitir selecionar produtos e gerar etiquetas imprimíveis com códigos e preços vigentes.

## Escopo

- seleção em lote por pesquisa, categoria, marca e produto;
- quantidade de etiquetas por item;
- modelos versionados com dimensões, margens e campos habilitados;
- código interno, EAN/GTIN, descrição, unidade e preço vigente;
- preview antes da geração;
- PDF determinístico e download autorizado;
- auditoria da geração sem persistir dados sensíveis desnecessários.

## BDD e testes

Gerar uma e múltiplas etiquetas, validar código ausente/inválido, preço sem vigência, paginação do PDF,
permissão, isolamento e comparação visual controlada do documento. Testes API, PDF, React, Playwright
e acessibilidade.

## Adiado

Drivers de impressoras térmicas e impressão silenciosa dependem de decisão específica por plataforma.

