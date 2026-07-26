# Especificação — Cadastro de Produto

> Documento de referência para refatoração de código existente. Objetivo: padronizar nomes de campos, tipos, enums e regras condicionais do formulário/entidade "Produto".

---

## 1. Dados Gerais

| Campo | Tipo | Obrigatório | Observações |
|---|---|---|---|
| `descricao` | string | Sim | Nome/descrição do produto |
| `tipo` | enum | Sim | `kit`, `insumo`, `brinde` |
| `unidade` | enum | Sim | `caixa`, `fardo`, `unidade`, `quilograma`, `metros` |
| `categoria` | string / FK | Sim | Referência à tabela de categorias |
| `sub_categoria` | string / FK | Não | Referência à tabela de subcategorias (depende de `categoria`) |
| `marca` | string / FK | Não | |
| `modelo` | string | Não | |
| `tag` | string[] | Não | Múltiplas tags |
| `codigo_balanca` | string | Não | Código para integração com balança |
| `codigo_interno` | string | Não | SKU interno |
| `ativo` | boolean | Sim | Ativo/Inativo |
| `codigo_barra` | string | Não | EAN/GTIN |

---

## 2. Preços

| Campo | Tipo | Observações |
|---|---|---|
| `preco_custo` | decimal | Valor de custo |
| `preco_venda_varejo` | decimal | Calculado ou informado |
| `margem_lucro_varejo` | decimal (%) | Vinculado ao `preco_venda_varejo` (cálculo bidirecional: informar preço calcula margem, ou vice-versa) |
| `preco_venda_atacado` | decimal | |
| `margem_lucro_atacado` | decimal (%) | Mesma lógica bidirecional do varejo |
| `quantidade_minima_atacado` | decimal | Quantidade a partir da qual vale o preço de atacado |

**Regra:** `preco_venda_atacado` só é aplicado se a quantidade vendida ≥ `quantidade_minima_atacado`.

---

## 3. Características / Estoque

| Campo | Tipo | Observações |
|---|---|---|
| `controla_estoque` | boolean | Toggle principal |

### Se `controla_estoque = true`:
| Campo | Tipo |
|---|---|
| `estoque_minimo` | decimal |
| `estoque_atual` | decimal |
| `tipo_movimento` | enum: `entrada`, `saida` |
| `quantidade_movimento` | decimal |
| ação | botão "OK" para confirmar o lançamento de movimento |

### Se `controla_estoque = false`:
- Sistema não deve exibir nem validar campos de estoque.
- Nenhum lançamento de movimento é permitido para este produto.

---

## 4. Fiscal

| Campo | Tipo | Observações |
|---|---|---|
| `tipo_fiscal` | enum | Ver lista abaixo |
| `ncm` | string | Código NCM |
| `origem` | enum (0–8) | Ver lista abaixo |
| `cest` | string | Não |
| `classificacao` | enum | `comum`, `medicamento`, `armamento`, `combustiveis`, `veiculos_novos` |

**Enum `tipo_fiscal`:**
`ativo_imobilizado`, `embalagem`, `material_uso_consumo`, `materia_prima`, `mercadoria_revenda`, `outras`, `outro_insumo`, `produto_acabado`, `produto_processo`, `produto_intermediario`, `servico`, `subproduto`

**Enum `origem`** (código CST de origem):
| Valor | Descrição |
|---|---|
| 0 | Nacional: Geral |
| 1 | Estrangeira: Importação direta |
| 2 | Estrangeira: Mercado interno |
| 3 | Nacional: Conteúdo importado > 40% e ≤ 70% |
| 4 | Nacional: Produção básica (iniciativas federais) |
| 5 | Nacional: Conteúdo importado ≤ 40% |
| 6 | Estrangeira: Importação direta sem similar nacional (Camex/gás natural) |
| 7 | Estrangeira: Mercado interno sem similar nacional (Camex) |
| 8 | Nacional: Conteúdo importado > 70% |

---

## 5. Fragmentação (venda fracionada)

Usado quando o produto é vendido em unidade diferente da unidade de estoque/compra.

| Campo | Tipo | Observações |
|---|---|---|
| `fracionamento_ativo` | boolean | Se o produto permite venda fracionada |
| `fracionamento_quantidade` | decimal | Ex.: 1000 (ml em 1 litro), 10 (pacotes em 1 caixa) |
| `fracionamento_unidade` | enum | Mesma lista de `unidade`: `caixa`, `fardo`, `unidade`, `quilograma`, `metros` |
| `fracionamento_valor_venda` | decimal | Valor de venda da unidade fracionada |
| `estoque_consumo` | decimal/boolean | Precisa esclarecer se é campo numérico (saldo) ou apenas flag — **checar com o time o comportamento esperado** |

**Exemplo de regra:** `1 Caixa = 10 pacotes` → `fracionamento_quantidade = 10`, `fracionamento_unidade = pacote/unidade`.

⚠️ Ponto de atenção: o exemplo cita "1 Hora/Funcionário" — isso sugere que `fracionamento_unidade` também pode precisar aceitar unidades de serviço (hora, funcionário), não só as unidades físicas já listadas. Vale confirmar se a lista de `unidade` deve ser expandida para cobrir serviços.

---

## 6. Sugestão de schema (JSON) para orientar o agente

```json
{
  "produto": {
    "descricao": "string",
    "tipo": "kit | insumo | brinde",
    "unidade": "caixa | fardo | unidade | quilograma | metros",
    "categoria": "string",
    "sub_categoria": "string",
    "marca": "string",
    "modelo": "string",
    "tag": ["string"],
    "codigo_balanca": "string",
    "codigo_interno": "string",
    "ativo": "boolean",
    "codigo_barra": "string",
    "precos": {
      "custo": "decimal",
      "venda_varejo": "decimal",
      "margem_lucro_varejo": "decimal",
      "venda_atacado": "decimal",
      "margem_lucro_atacado": "decimal",
      "quantidade_minima_atacado": "decimal"
    },
    "estoque": {
      "controla_estoque": "boolean",
      "minimo": "decimal|null",
      "atual": "decimal|null",
      "movimento": {
        "tipo": "entrada | saida",
        "quantidade": "decimal"
      }
    },
    "fiscal": {
      "tipo": "enum(tipo_fiscal)",
      "ncm": "string",
      "origem": "0-8",
      "cest": "string",
      "classificacao": "comum | medicamento | armamento | combustiveis | veiculos_novos"
    },
    "fragmentacao": {
      "ativo": "boolean",
      "quantidade": "decimal",
      "unidade": "enum(unidade)",
      "valor_venda": "decimal",
      "estoque_consumo": "decimal|boolean"
    }
  }
}
```

---

## 7. Pontos para validar antes de repassar ao agente
1. `sub_categoria` depende de `categoria` — confirmar se é lista fixa ou dinâmica via API.
2. Margem de lucro e preço de venda: definir qual é a fonte da verdade (cálculo automático nos dois sentidos?).
3. `estoque_consumo`: tipo e comportamento ainda ambíguos no rascunho original.
4. Unidades de fragmentação podem precisar incluir tipos de serviço (ex.: hora/funcionário).
5. Confirmar se `codigo_barra` aceita múltiplos códigos (ex.: variações de embalagem) ou é único.
