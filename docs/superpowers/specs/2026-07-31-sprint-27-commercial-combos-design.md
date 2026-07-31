# Sprint 27 — Combos Comerciais

## Objetivo

Criar ofertas comerciais compostas por produtos, serviços ou kits, com preço e vigência próprios,
sem representar montagem ou saldo físico.

## Distinção obrigatória

Kit (Sprint 23) define decomposição de estoque. Combo define apresentação e precificação de venda.
O combo referencia itens vendáveis; cada item conserva suas regras de estoque e fiscal.

## Escopo

- combo, itens, quantidades, preço, vigência, estado e limites opcionais por filial;
- CRUD e preview da composição comercial;
- seleção no PDV/venda e expansão auditável dos itens;
- validação atômica de disponibilidade dos itens estocáveis;
- cálculo decimal e histórico da versão aplicada à venda.

## BDD e testes

Criar combo, vender com preço próprio, expirar vigência, impedir item inativo/cross-tenant, preservar
histórico e provar que kit dentro do combo continua usando a regra da Sprint 23.

## Adiado

Promoções complexas, cupons, segmentação de clientes e motor de campanhas ficam fora desta sprint.

