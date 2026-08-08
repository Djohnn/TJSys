# Sprint 12 — Pessoas, Clientes e Parceiros Design

## Objetivo

Criar o cadastro operacional de pessoas do TJSys para clientes, fornecedores, transportadores e contatos, sustentando vendas identificadas, emissão fiscal correta, compras, financeiro, LGPD e futuras ações de relacionamento.

## Escopo

A Sprint 12 consolida dados cadastrais de pessoa física e jurídica. Ela complementa fornecedores mínimos criados em compras e prepara vendas com cliente identificado, endereços, documentos fiscais, contatos e consentimentos.

## Arquitetura

Criar o app `people` como bounded context leve, consumido por `sales`, `purchasing`, `financial` e `fiscal`. O app deve expor APIs tenant-scoped e serviços de validação/cadastro sem vazar dados entre tenants.

Fluxo base:

1. usuário cadastra pessoa PF/PJ;
2. sistema normaliza documento, e-mail, telefone e endereço;
3. papéis são atribuídos: cliente, fornecedor, transportador, contato;
4. vendas e documentos fiscais podem referenciar a pessoa;
5. alterações relevantes geram auditoria e Outbox.

## Modelos previstos

- `Person`
- `PersonRole`
- `PersonDocument`
- `PersonAddress`
- `PersonContact`
- `ConsentRecord`

## Regras de negócio

- CPF/CNPJ é único por tenant quando informado e ativo.
- Pessoa pode acumular múltiplos papéis.
- Endereço fiscal e endereço de entrega são distintos.
- Dados pessoais são classificados como `Confidential`.
- Documento, telefone e e-mail são normalizados antes da persistência.
- Exclusão lógica preserva histórico fiscal, financeiro e de vendas.
- Alterações sensíveis geram auditoria.

## APIs previstas

- `GET/POST /api/v1/people/`
- `GET/PATCH /api/v1/people/{id}/`
- `POST /api/v1/people/{id}/deactivate/`
- `GET/POST /api/v1/people/{id}/addresses/`
- `GET/POST /api/v1/people/{id}/contacts/`
- `GET/POST /api/v1/people/{id}/consents/`

## Fora do escopo

- CRM avançado com funil comercial.
- Marketing automation.
- Score de crédito automático.
- Consulta externa de CPF/CNPJ.
- Enriquecimento por IA.

## Critérios de aceite

- Pessoa PF/PJ pode ser cadastrada e consultada por tenant.
- CPF/CNPJ duplicado no mesmo tenant é bloqueado.
- Mesmo documento pode existir em tenants distintos.
- Venda pode referenciar cliente identificado sem quebrar venda balcão.
- Fornecedor mínimo de compras pode ser relacionado a `Person`.
- Dados sensíveis não aparecem em logs ou eventos de forma indevida.
