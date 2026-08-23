# TJSys Design System

**Versão:** 1.1  
**Status:** Base oficial de identidade visual e interface  
**Aplicação:** ERP Web, Painel Administrativo, PDV Desktop e futuras aplicações da TJSys

---

## 1. Visão Geral

O Design System da TJSys estabelece os padrões visuais e funcionais utilizados em todas as interfaces do sistema. Seu objetivo é garantir consistência, clareza, acessibilidade, escalabilidade e facilidade de manutenção.

A identidade visual utiliza como base as três cores institucionais da marca:

- Azul escuro `#00269A`
- Verde `#4AAC0F`
- Branco `#FFFFFF`

Essas cores são complementadas por escalas semânticas destinadas a estados, alertas, feedbacks, gráficos, formulários, tabelas e componentes de navegação.

### 1.1 Logotipo

O logotipo é composto por três elementos: símbolo (escudo com corte em "T"), wordmark ("TJSys") e o **ponto final em quadrado verde**, que funciona como a assinatura visual da marca — o "." de TJSys não é um ponto tipográfico comum, é um quadrado sólido na cor `success-700` (`#4AAC0F`).

**Regra fixa:** o quadrado verde nunca muda de cor entre as variações de logotipo. Ele é o único elemento que permanece `success-700` em todas as versões — inclusive quando o restante do logotipo inverte de branco para azul (ou vice-versa) conforme o fundo.

| Variação | Uso | Símbolo + wordmark | Ponto final |
|---|---|---|---|
| Positivo (sobre fundo azul) | Fundo `primary-800` `#00269A`, banners institucionais, splash, capa de apresentações | Branco `#FFFFFF` | `success-700` `#4AAC0F` |
| Principal (sobre fundo claro) | Fundo `#FFFFFF` ou `gray-50`, uso padrão em telas, cabeçalhos, documentos | Azul `primary-800` `#00269A` | `success-700` `#4AAC0F` |

**Proporções e construção**

- O quadrado verde é posicionado alinhado à base da linha do wordmark, logo após o "s" final de "Sys", sem espaçamento adicional — funciona visualmente como pontuação, não como elemento decorativo solto.
- O lado do quadrado corresponde a aproximadamente 1/3 da altura x-height da wordmark (altura das letras minúsculas "y" e "s"), nunca ultrapassando a altura de uma letra maiúscula.
- Área de proteção mínima ao redor do logotipo completo: altura do "T" do símbolo, livre de outros elementos gráficos ou texto.
- Tamanho mínimo de reprodução: 24px de altura para uso digital; abaixo disso, usar apenas o símbolo (escudo), sem wordmark.

**Restrições**

- Nunca recolorir o quadrado verde para outra cor da paleta (nem `success-600`, `success-900` etc.) — é sempre `success-700` `#4AAC0F` exato.
- Nunca substituir o quadrado por um ponto tipográfico redondo ou por outro caractere.
- Nunca aplicar o logotipo positivo (branco) sobre fundo claro, nem o principal (azul) sobre fundo azul — contraste insuficiente em ambos os casos.
- Nunca separar o quadrado verde do wordmark ou redimensioná-lo desproporcionalmente em relação ao texto.

---

## 2. Princípios do Design System

1. **Clareza:** a interface deve comunicar ações, estados e informações sem ambiguidades.
2. **Consistência:** componentes semelhantes devem apresentar o mesmo comportamento visual e funcional.
3. **Acessibilidade:** textos, botões, alertas e estados devem possuir contraste adequado.
4. **Eficiência:** a interface deve reduzir etapas e facilitar tarefas frequentes.
5. **Escalabilidade:** os mesmos padrões devem funcionar no painel web, PDV e aplicações futuras.
6. **Feedback imediato:** toda ação relevante deve apresentar retorno visual ao usuário.
7. **Hierarquia:** títulos, textos, botões e informações devem possuir níveis visuais bem definidos.

---

## 3. Paleta Institucional

### 3.1 Azul institucional

| Token | HEX | Uso |
|---|---:|---|
| `primary-900` | `#001B73` | Hover escuro, barra superior, navegação |
| `primary-800` | `#00269A` | Cor principal da marca |
| `primary-700` | `#0B3DBF` | Links e itens ativos |
| `primary-600` | `#2A5DDA` | Botões secundários e destaques |
| `primary-500` | `#5D8BF4` | Ícones e gráficos |
| `primary-100` | `#EAF1FF` | Fundo de seleção e estados ativos |
| `primary-50` | `#F5F8FF` | Hover leve e superfícies suaves |

### 3.2 Verde institucional

| Token | HEX | Uso |
|---|---:|---|
| `success-900` | `#2E7D32` | Texto de sucesso |
| `success-800` | `#3E950D` | Hover de ações positivas |
| `success-700` | `#4AAC0F` | Cor institucional de sucesso — uso decorativo, ícones, gráficos, bordas, badges com texto escuro |
| `success-600` | `#63C132` | Indicadores e destaques |
| `success-500` | `#7DD95A` | Gráficos |
| `success-100` | `#EAF8DF` | Fundo de mensagens positivas |
| `success-50` | `#F4FBEF` | Fundo leve de sucesso |
| `success-950` | `#1F5C24` | Hover do botão de sucesso |

> **Nota de acessibilidade:** `success-700` (`#4AAC0F`) com texto branco sobre fundo sólido produz contraste de ~2,9:1, abaixo do mínimo WCAG AA (4,5:1) para texto normal. Por isso, botões e superfícies sólidas com texto branco devem usar `success-900` (contraste ~5,1:1), nunca `success-700` diretamente. O verde institucional puro segue livre para ícones, gráficos, bordas e badges com texto escuro sobre fundo claro.

### 3.3 Branco e superfícies

| Token | HEX | Uso |
|---|---:|---|
| `white` | `#FFFFFF` | Fundo principal e textos sobre cores escuras |
| `surface-default` | `#FFFFFF` | Cards, modais e formulários |
| `surface-soft` | `#FAFBFC` | Fundo secundário |
| `surface-muted` | `#F5F7FA` | Área de apoio, blocos e tabelas |

---

## 4. Escala de Cinza

| Token | HEX | Uso |
|---|---:|---|
| `gray-900` | `#1F2937` | Títulos e textos de alto contraste |
| `gray-800` | `#374151` | Texto principal |
| `gray-700` | `#4B5563` | Texto secundário |
| `gray-600` | `#6B7280` | Labels e informações auxiliares |
| `gray-500` | `#9CA3AF` | Placeholders |
| `gray-400` | `#D1D5DB` | Bordas de campos |
| `gray-300` | `#E5E7EB` | Divisórias |
| `gray-200` | `#F3F4F6` | Fundo de campos desabilitados |
| `gray-100` | `#F9FAFB` | Fundo geral |
| `gray-50` | `#FCFCFD` | Superfície de baixa ênfase |

---

## 5. Cores Semânticas

### 5.1 Informação

| Token | HEX | Uso |
|---|---:|---|
| `info-700` | `#1D4ED8` | Texto informativo |
| `info-600` | `#2563EB` | Ícones e botões de informação |
| `info-100` | `#DBEAFE` | Fundo informativo |
| `info-50` | `#EFF6FF` | Fundo leve |

### 5.2 Atenção

| Token | HEX | Uso |
|---|---:|---|
| `warning-800` | `#9A6700` | Texto de atenção |
| `warning-600` | `#F4B400` | Alertas, estoque baixo |
| `warning-100` | `#FEF3C7` | Fundo de atenção |
| `warning-50` | `#FFFBEB` | Fundo leve |

### 5.3 Alerta operacional

| Token | HEX | Uso |
|---|---:|---|
| `alert-800` | `#C2410C` | Texto de alerta |
| `alert-600` | `#EA580C` | Sincronização pendente, conexão instável |
| `alert-100` | `#FFEDD5` | Fundo de alerta |
| `alert-50` | `#FFF7ED` | Fundo leve |

### 5.4 Erro

| Token | HEX | Uso |
|---|---:|---|
| `danger-900` | `#991B1B` | Situações críticas |
| `danger-700` | `#B91C1C` | Hover de exclusão |
| `danger-600` | `#DC2626` | Erros, cancelamentos, exclusão |
| `danger-100` | `#FEE2E2` | Fundo de erro |
| `danger-50` | `#FEF2F2` | Fundo leve |

### 5.5 Crítico

| Token | HEX | Uso |
|---|---:|---|
| `critical-900` | `#7F1D1D` | Falhas graves |
| `critical-800` | `#991B1B` | Sistema indisponível |
| `critical-100` | `#FECACA` | Fundo de criticidade |

---

## 6. Cores por Módulo

| Módulo | Cor | HEX |
|---|---|---:|
| Vendas | Azul (tom secundário) | `#0B3DBF` |
| Financeiro | Dourado escuro | `#854D0E` |
| Compras | Laranja queimado | `#9A3412` |
| Estoque | Roxo | `#7C3AED` |
| Fiscal | Turquesa | `#0891B2` |
| Pessoas | Magenta | `#A21CAF` |
| Relatórios | Cinza | `#6B7280` |
| Administração SaaS | Cinza-escuro neutro | `#374151` |

> As cores de módulo devem ser usadas em ícones, gráficos e marcadores. Elas não substituem as cores semânticas de sucesso, alerta ou erro.
>
> **Correção v1.1:** na versão anterior, Vendas, Financeiro, Compras e Administração SaaS usavam exatamente o mesmo HEX das cores semânticas (`primary-800`, `success-700`, `alert-600` e `primary-900`, respectivamente). Isso criava ambiguidade real — por exemplo, um indicador laranja em Compras era visualmente idêntico ao alerta de "sincronização pendente". As cores acima são únicas e não coincidem com nenhum token semântico, mantendo a mesma família cromática onde fazia sentido (Vendas continua azul, Compras continua laranja) mas em tons que não se confundem com estado de sistema. Pessoas mudou de índigo para magenta por estar cromaticamente perto demais do azul institucional em ícones pequenos.

---

## 7. Tipografia

### 7.1 Família principal

Recomenda-se utilizar uma fonte sem serifa, moderna e de alta legibilidade.

Sugestões:

- Inter
- Roboto
- Source Sans 3

### 7.2 Escala tipográfica

| Token | Tamanho | Peso | Uso |
|---|---:|---:|---|
| `text-xs` | 12 px | 400 | Ajuda, legendas |
| `text-sm` | 14 px | 400 | Labels e tabelas |
| `text-md` | 16 px | 400 | Texto padrão |
| `text-lg` | 18 px | 500 | Subtítulos |
| `text-xl` | 20 px | 600 | Títulos de seção |
| `text-2xl` | 24 px | 600 | Títulos de página |
| `text-3xl` | 30 px | 700 | Indicadores e destaques |

### 7.3 Regras

- Evitar textos longos em letras maiúsculas.
- Usar peso 600 ou 700 apenas em títulos e números importantes.
- Manter contraste mínimo adequado entre texto e fundo.
- Utilizar no máximo três pesos tipográficos por tela.

---

## 8. Botões

### 8.1 Botão primário

- Fundo: `#00269A`
- Hover: `#001B73`
- Texto: `#FFFFFF`
- Uso: ação principal da tela

### 8.2 Botão de sucesso

- Fundo: `#2E7D32` (`success-900`)
- Hover: `#1F5C24` (`success-950`)
- Texto: `#FFFFFF`
- Uso: salvar, confirmar, concluir
- Nota: o verde institucional puro (`#4AAC0F`) não é usado aqui por não atingir contraste mínimo WCAG AA com texto branco (~2,9:1); permanece reservado para ícones, gráficos e badges com texto escuro.

### 8.3 Botão destrutivo

- Fundo: `#DC2626`
- Hover: `#B91C1C`
- Texto: `#FFFFFF`
- Uso: excluir, cancelar definitivamente

### 8.4 Botão secundário

- Fundo: `#FFFFFF`
- Borda: `#D1D5DB`
- Texto: `#374151`
- Hover: `#F3F4F6`

### 8.5 Botão informativo

- Fundo: `#2563EB`
- Hover: `#1D4ED8`
- Texto: `#FFFFFF`

### 8.6 Regras de uso

- Deve existir apenas um botão primário por área de decisão.
- Ações destrutivas devem exigir confirmação.
- Botões desabilitados não devem parecer interativos.
- Ícones devem complementar o texto, não substituí-lo em ações críticas.

---

## 9. Formulários

### 9.1 Estados de campo

| Estado | Borda | Fundo |
|---|---:|---:|
| Normal | `#D1D5DB` | `#FFFFFF` |
| Foco | `#00269A` | `#FFFFFF` |
| Erro | `#DC2626` | `#FEF2F2` |
| Sucesso | `#4AAC0F` | `#F4FBEF` |
| Desabilitado | `#E5E7EB` | `#F3F4F6` |

### 9.2 Regras

- Labels devem permanecer visíveis.
- Placeholders não substituem labels.
- Mensagens de erro devem indicar como corrigir o problema.
- Campos obrigatórios devem possuir indicação visual consistente.
- O foco deve ser claramente visível para navegação por teclado.

---

## 10. Alertas e Notificações

### 10.1 Toast de sucesso

- Ícone: confirmação
- Fundo: `#EAF8DF`
- Borda: `#4AAC0F`
- Texto: `#2E7D32`

### 10.2 Toast informativo

- Fundo: `#DBEAFE`
- Borda: `#2563EB`
- Texto: `#1D4ED8`

### 10.3 Toast de atenção

- Fundo: `#FEF3C7`
- Borda: `#F4B400`
- Texto: `#9A6700`

### 10.4 Toast de alerta

- Fundo: `#FFEDD5`
- Borda: `#F97316`
- Texto: `#C2410C`

### 10.5 Toast de erro

- Fundo: `#FEE2E2`
- Borda: `#DC2626`
- Texto: `#991B1B`

### 10.6 Exemplos de mensagem

- “Alterações salvas com sucesso.”
- “Sincronização concluída.”
- “Existem campos obrigatórios não preenchidos.”
- “A conexão com o servidor foi interrompida.”
- “Não foi possível concluir a operação.”

---

## 11. Badges e Status

| Status | Fundo | Texto |
|---|---:|---:|
| Ativo | `#EAF8DF` | `#2E7D32` |
| Inativo | `#F3F4F6` | `#6B7280` |
| Pendente | `#FEF3C7` | `#9A6700` |
| Bloqueado | `#FEE2E2` | `#991B1B` |
| Cancelado | `#FFEDD5` | `#C2410C` |
| Sincronizado | `#DBEAFE` | `#1D4ED8` |

---

## 12. Tabelas

### 12.1 Cores

| Elemento | HEX |
|---|---:|
| Cabeçalho | `#F3F4F6` |
| Linha padrão | `#FFFFFF` |
| Linha alternada | `#FAFBFC` |
| Linha em hover | `#F5F8FF` |
| Linha selecionada | `#EAF1FF` |
| Borda | `#E5E7EB` |
| Texto principal | `#374151` |
| Texto secundário | `#6B7280` |

### 12.2 Regras

- Cabeçalhos devem possuir bom contraste.
- Colunas numéricas devem ser alinhadas à direita.
- Ações devem permanecer na última coluna.
- Estados vazios devem indicar a próxima ação possível.
- Tabelas extensas devem possuir paginação ou carregamento progressivo.

---

## 13. Cards

### 13.1 Card padrão

- Fundo: `#FFFFFF`
- Borda: `#E5E7EB`
- Raio: `8 px`
- Sombra: leve
- Padding: `16 px` ou `24 px`

### 13.2 Card selecionado

- Fundo: `#F5F8FF`
- Borda: `#00269A`

### 13.3 Card de indicador

- Título: `#6B7280`
- Valor: `#1F2937`
- Destaque: cor do módulo correspondente

---

## 14. Espaçamento

Adotar uma escala baseada em múltiplos de 4.

| Token | Valor |
|---|---:|
| `space-1` | 4 px |
| `space-2` | 8 px |
| `space-3` | 12 px |
| `space-4` | 16 px |
| `space-5` | 20 px |
| `space-6` | 24 px |
| `space-8` | 32 px |
| `space-10` | 40 px |
| `space-12` | 48 px |

---

## 15. Bordas e Raios

| Token | Valor | Uso |
|---|---:|---|
| `radius-sm` | 4 px | Badges e elementos pequenos |
| `radius-md` | 8 px | Botões, campos, cards |
| `radius-lg` | 12 px | Modais e painéis |
| `radius-full` | 9999 px | Avatares e pills |

---

## 16. Sombras

```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.06);
--shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08);
--shadow-lg: 0 12px 24px rgba(0, 0, 0, 0.12);
```

Usar sombras com moderação. A hierarquia deve depender principalmente de espaçamento, bordas e contraste.

---

## 17. Ícones

- Usar uma única biblioteca de ícones em todo o produto.
- Tamanho padrão: `20 px`.
- Tamanho pequeno: `16 px`.
- Tamanho de destaque: `24 px`.
- Ícones de erro e alerta devem manter as cores semânticas correspondentes.
- Ícones não devem substituir textos em ações importantes.

---

## 18. Gráficos e Dashboard

### 18.1 Ordem recomendada

1. `#0B3DBF` (Vendas)
2. `#854D0E` (Financeiro)
3. `#9A3412` (Compras)
4. `#7C3AED` (Estoque)
5. `#0891B2` (Fiscal)
6. `#A21CAF` (Pessoas)
7. `#6B7280` (Relatórios)

### 18.2 Regras

- Evitar depender apenas da cor para diferenciar dados.
- Utilizar rótulos, ícones, padrões ou legendas.
- Manter a mesma cor para o mesmo módulo em todas as telas.
- Valores negativos devem usar vermelho somente quando representarem risco ou perda.
- Não utilizar verde e vermelho como única distinção sem texto auxiliar.

---

## 19. Estados Operacionais do Sistema

| Estado | Cor | Exemplo |
|---|---|---|
| Salvando | `info-600` | “Salvando alterações...” |
| Salvo | `success-700` | “Alterações salvas.” |
| Atualizando | `info-600` | “Atualizando dados...” |
| Sincronizando | `info-600` | “Sincronizando operações...” |
| Sincronização pendente | `alert-600` | “3 operações aguardando envio.” |
| Conflito de sincronização | `danger-700` (borda tracejada) | “Cupom emitido localmente, mas a NFC-e não foi confirmada. Revise antes de continuar.” |
| Estoque baixo | `warning-600` | “Produto abaixo do estoque mínimo.” |
| Falha | `danger-600` | “Não foi possível salvar.” |
| Indisponível | `critical-800` | “Servidor indisponível.” |

> **Conflito de sincronização** é diferente de falha simples: representa uma inconsistência de dados que exige decisão manual (ex.: cupom impresso mas NFC-e não emitida), não apenas repetir a ação. Usar `danger-700` com borda tracejada (em vez de sólida) para diferenciar visualmente de um erro comum.

---

## 20. Tokens CSS

```css
:root {
  --color-primary-900: #001B73;
  --color-primary-800: #00269A;
  --color-primary-700: #0B3DBF;
  --color-primary-600: #2A5DDA;
  --color-primary-500: #5D8BF4;
  --color-primary-100: #EAF1FF;
  --color-primary-50: #F5F8FF;

  --color-success-950: #1F5C24;
  --color-success-900: #2E7D32;
  --color-success-800: #3E950D;
  --color-success-700: #4AAC0F;
  --color-success-600: #63C132;
  --color-success-500: #7DD95A;
  --color-success-100: #EAF8DF;
  --color-success-50: #F4FBEF;

  --color-info-700: #1D4ED8;
  --color-info-600: #2563EB;
  --color-info-100: #DBEAFE;
  --color-info-50: #EFF6FF;

  --color-warning-800: #9A6700;
  --color-warning-600: #F4B400;
  --color-warning-100: #FEF3C7;
  --color-warning-50: #FFFBEB;

  --color-alert-800: #C2410C;
  --color-alert-600: #EA580C;
  --color-alert-100: #FFEDD5;
  --color-alert-50: #FFF7ED;

  --color-danger-900: #991B1B;
  --color-danger-700: #B91C1C;
  --color-danger-600: #DC2626;
  --color-danger-100: #FEE2E2;
  --color-danger-50: #FEF2F2;

  --color-gray-900: #1F2937;
  --color-gray-800: #374151;
  --color-gray-700: #4B5563;
  --color-gray-600: #6B7280;
  --color-gray-500: #9CA3AF;
  --color-gray-400: #D1D5DB;
  --color-gray-300: #E5E7EB;
  --color-gray-200: #F3F4F6;
  --color-gray-100: #F9FAFB;
  --color-white: #FFFFFF;

  --color-background: #F9FAFB;
  --color-surface: #FFFFFF;
  --color-border: #E5E7EB;
  --color-text: #374151;
  --color-text-muted: #6B7280;

  --color-module-vendas: #0B3DBF;
  --color-module-financeiro: #854D0E;
  --color-module-compras: #9A3412;
  --color-module-estoque: #7C3AED;
  --color-module-fiscal: #0891B2;
  --color-module-pessoas: #A21CAF;
  --color-module-relatorios: #6B7280;
  --color-module-admin: #374151;

  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.06);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08);
  --shadow-lg: 0 12px 24px rgba(0, 0, 0, 0.12);
}
```

---

## 21. Tokens TypeScript

```ts
export const colors = {
  primary: {
    900: "#001B73",
    800: "#00269A",
    700: "#0B3DBF",
    600: "#2A5DDA",
    500: "#5D8BF4",
    100: "#EAF1FF",
    50: "#F5F8FF",
  },
  success: {
    950: "#1F5C24",
    900: "#2E7D32",
    800: "#3E950D",
    700: "#4AAC0F",
    600: "#63C132",
    500: "#7DD95A",
    100: "#EAF8DF",
    50: "#F4FBEF",
  },
  info: {
    700: "#1D4ED8",
    600: "#2563EB",
    100: "#DBEAFE",
    50: "#EFF6FF",
  },
  warning: {
    800: "#9A6700",
    600: "#F4B400",
    100: "#FEF3C7",
    50: "#FFFBEB",
  },
  alert: {
    800: "#C2410C",
    600: "#EA580C",
    100: "#FFEDD5",
    50: "#FFF7ED",
  },
  danger: {
    900: "#991B1B",
    700: "#B91C1C",
    600: "#DC2626",
    100: "#FEE2E2",
    50: "#FEF2F2",
  },
  gray: {
    900: "#1F2937",
    800: "#374151",
    700: "#4B5563",
    600: "#6B7280",
    500: "#9CA3AF",
    400: "#D1D5DB",
    300: "#E5E7EB",
    200: "#F3F4F6",
    100: "#F9FAFB",
  },
  white: "#FFFFFF",
  module: {
    vendas: "#0B3DBF",
    financeiro: "#854D0E",
    compras: "#9A3412",
    estoque: "#7C3AED",
    fiscal: "#0891B2",
    pessoas: "#A21CAF",
    relatorios: "#6B7280",
    admin: "#374151",
  },
} as const;
```

---

## 22. Acessibilidade

- Todo texto deve possuir contraste suficiente com o fundo.
- Estados não devem ser comunicados somente por cor.
- Botões e links devem possuir foco visível.
- Componentes devem ser navegáveis por teclado.
- Mensagens de erro devem ser associadas ao campo correspondente.
- Ícones decorativos devem ser ignorados por leitores de tela.
- Ícones informativos devem possuir texto alternativo.
- O tamanho mínimo recomendado para áreas clicáveis é `44 × 44 px`.

---

## 23. Uso Correto das Cores

### Correto

- Azul institucional para navegação e ações principais.
- Verde para confirmação, salvamento e sucesso.
- Amarelo para atenção.
- Laranja para pendências operacionais.
- Vermelho para erro, exclusão e bloqueio.
- Cinza para estrutura, texto secundário e estados neutros.

### Incorreto

- Utilizar verde em ações destrutivas.
- Utilizar vermelho em informações neutras.
- Usar várias cores fortes na mesma tela sem hierarquia.
- Utilizar cores de módulos como substitutas das cores semânticas.
- Exibir textos claros sobre fundos sem contraste.

---

## 24. Convenção de Nomes

Os tokens devem seguir nomes semânticos e previsíveis:

```text
color-primary-800
color-success-700
color-warning-600
color-danger-600
color-background
color-surface
color-border
color-text
color-text-muted
```

Evitar nomes como:

```text
blue-main
green-button
red-error-dark
color-1
color-final
```

---

## 25. Governança

Toda nova cor, componente ou variação visual deve:

1. Resolver uma necessidade real.
2. Reutilizar tokens existentes quando possível.
3. Ser documentada.
4. Ser validada em diferentes telas.
5. Ser verificada quanto à acessibilidade.
6. Ser aplicada de forma consistente no React e no Electron.

---

## 26. Status do Documento

Este arquivo representa a versão inicial oficial do Design System da TJSys. Ele deverá evoluir juntamente com o produto e, futuramente, poderá receber:

- tema escuro;
- biblioteca completa de componentes;
- documentação Storybook;
- tokens em JSON;
- padrões de animação;
- grid responsivo;
- padrões para dispositivos móveis;
- componentes específicos do PDV;
- guia de acessibilidade ampliado;
- documentação de voz e tom da marca.

---

## 27. Changelog

### v1.1 — Auditoria de cor e correções de harmonia

1. **Contraste do botão de sucesso corrigido** — fundo passou de `success-700` (`#4AAC0F`, contraste ~2,9:1 com texto branco, reprovava WCAG AA) para `success-900` (`#2E7D32`, ~5,1:1). Adicionado token `success-950` para o estado de hover. O verde institucional puro permanece como cor de marca para ícones, gráficos e badges com texto escuro.
2. **Cores de módulo deixaram de duplicar cores semânticas** — Vendas, Financeiro, Compras e Administração SaaS usavam exatamente o mesmo HEX de `primary-800`, `success-700`, `alert-600` e `primary-900`. Reatribuídas para valores únicos (seção 6), eliminando a ambiguidade entre "cor de módulo" e "estado do sistema".
3. **Pessoas mudou de índigo (`#4F46E5`) para magenta (`#A21CAF`)** por proximidade excessiva de matiz com o azul institucional em ícones pequenos.
4. **Alerta operacional (`alert-600`) mudou de `#F97316` para `#EA580C`**, afastando o matiz do `warning-600` (`#F4B400`) para reduzir risco de confusão entre "atenção" e "alerta operacional", inclusive para usuários com deuteranopia/protanopia.
5. **Novo estado "Conflito de sincronização"** (seção 19) para diferenciar inconsistências que exigem decisão manual (ex.: cupom impresso sem NFC-e confirmada) de falhas simples que só precisam de nova tentativa.
6. **Cores de módulo formalizadas como tokens** em CSS (`--color-module-*`) e TypeScript (`colors.module.*`), antes documentadas apenas em tabela markdown.
7. **Nova seção 1.1 — Logotipo**, especificando o quadrado verde (`success-700`) como ponto final fixo da marca, variações positivo/principal e regras de uso.
