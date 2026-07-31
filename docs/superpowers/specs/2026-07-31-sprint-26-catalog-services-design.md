# Sprint 26 — Cadastro e Venda de Serviços

## Objetivo

Representar serviços como itens vendáveis não estocáveis, com preço e configuração fiscal próprios.

## Escopo

- entidade/tipo de item Serviço com código, descrição, unidade de cobrança, duração opcional e estado;
- preços por vigência e filial reutilizando a infraestrutura comercial do catálogo;
- configuração fiscal de serviço sem misturar NCM/CEST de mercadoria;
- pesquisa e seleção em vendas/PDV, sem gerar movimento de estoque;
- preparação contratual para emissão de NFS-e, sem acoplar provedor.

## Regras

- serviço nunca possui lote, validade, saldo ou `tracks_inventory=true`;
- venda pode combinar produto e serviço, preservando totalização e auditoria;
- emissão NFS-e permanece atrás do port fiscal e capability apropriada.

## BDD e testes

CRUD, preço vigente, venda sem movimento de estoque, autorização, isolamento, regressão de venda
mista e erro fiscal legível. Cobertura API, React, Playwright, Sales, PDV e Fiscal.

## Adiado

Agendamento, ordem de serviço e integração real NFS-e exigem descoberta e sprint próprias.

