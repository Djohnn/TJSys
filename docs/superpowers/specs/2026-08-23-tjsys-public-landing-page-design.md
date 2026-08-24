# TJSys. — Landing Page Pública — Design

## 1. Objetivo

Criar uma landing page pública, responsiva e orientada à conversão para apresentar
o TJSys. a pequenos e médios varejistas e levá-los a solicitar uma demonstração
pelo WhatsApp.

A promessa central é:

> Venda mais, sem perder o controle do estoque.

Esta entrega acontece antes da cobrança real. Ela não publica preços, não cria
checkout e não altera o fluxo de cadastro público existente.

## 2. Decisões confirmadas

- Marca pública: **TJSys.**, sempre com ponto final.
- Direção: tecnologia confiável, com azul profundo, ciano e superfícies claras.
- CTA primário: **Solicite uma demonstração**.
- Comercial: **Planos sob medida para a sua operação**, sem valores publicados.
- Destino do lead: WhatsApp `+55 15 99819-1175`, usando
  `https://wa.me/5515998191175`.
- Persistência: nenhuma; os dados permanecem no navegador até a abertura do
  WhatsApp.
- Rota pública: `/`.
- Aplicação autenticada: namespace `/app`.

## 3. Abordagens consideradas

### A. Landing em `/` e painel em `/app` — escolhida

Cria uma fronteira clara entre aquisição pública e operação autenticada. É a
melhor base para SEO, campanhas e futuras páginas públicas. Exige atualizar rotas,
links internos e destinos pós-autenticação.

### B. Conteúdo condicional em `/`

Visitantes anônimos veriam a landing e usuários autenticados veriam o dashboard.
Reduz mudanças nos links atuais, mas mistura responsabilidades e impede que um
usuário autenticado consulte a página pública normalmente.

### C. Landing em `/inicio`

Preserva o painel em `/`, porém rebaixa a página comercial a uma URL secundária e
enfraquece a entrada natural do produto.

## 4. Arquitetura de rotas

`App.tsx` passa a ter duas áreas explícitas:

```text
/
├── /                  LandingPage (pública)
├── /login             LoginPage (pública)
├── /mfa               MfaPage (pública)
└── /app                ProtectedRoute + AppShell
    ├── index           DashboardPage
    ├── dashboard       DashboardPage
    └── demais módulos  rotas existentes sob o novo prefixo
```

Todos os links e `navigate()` do painel passam a apontar para `/app/...`. Os
destinos pós-login e pós-MFA também passam a `/app`. A alteração é somente de
frontend; os endpoints `/api/v1/...` permanecem intactos.

Não será criado redirecionamento genérico de qualquer URL antiga porque ele
poderia capturar futuras páginas públicas. Compatibilidade, quando necessária,
será explícita para destinos de entrada conhecidos.

## 5. Estrutura da página

### 5.1 Cabeçalho

- Marca TJSys.
- Navegação por âncoras: Solução, Módulos, Como funciona, Planos e Dúvidas.
- Link secundário “Entrar” para `/login`.
- CTA “Solicite uma demonstração” para o formulário.
- Cabeçalho compacto e legível; no mobile, navegação reduzida sem esconder o CTA.

### 5.2 Hero

- Eyebrow orientado ao público: “ERP para varejo em movimento”.
- Headline aprovada, sem superlativos.
- Subheadline entre 15 e 25 palavras explicando a conexão entre PDV, estoque,
  compras e financeiro.
- CTA primário para o formulário e link secundário “Conheça os módulos”.
- Visual de resultado: uma composição de controle operacional que conecta venda,
  disponibilidade de estoque e compromissos financeiros. Não usar screenshot
  ilegível, fotografia de banco genérica ou números apresentados como métricas
  reais.

### 5.3 Confiança sem prova fabricada

Como não existem logos de clientes, avaliações ou estudos de caso aprovados, a
faixa abaixo do hero apresenta garantias verificáveis do produto:

- operação integrada;
- visão por empresa e filial;
- rastreabilidade entre módulos;
- PDV e gestão no mesmo ecossistema.

Esses itens não devem simular depoimentos nem estatísticas de adoção.

### 5.4 Problema e solução

Uma seção curta contrasta a rotina fragmentada — venda em um lugar, estoque em
outro e financeiro atrasado — com a operação conectada do TJSys. O texto deve ser
específico e evitar medo artificial.

### 5.5 Módulos

Cards para seis frentes prioritárias:

1. PDV e vendas;
2. estoque;
3. compras;
4. financeiro;
5. fiscal;
6. relatórios e gestão.

Cada card descreve um resultado e usa o token cromático já atribuído ao módulo.
Ícones são simples, consistentes e decorativos quando o texto já comunica o
significado.

### 5.6 Como funciona

Três passos:

1. Entendemos sua operação em uma demonstração.
2. Configuramos empresas, filiais e os módulos necessários.
3. Sua equipe opera e acompanha tudo em um só lugar.

Não afirmar prazo de implantação enquanto ele não estiver comercialmente definido.

### 5.7 Planos

Uma única proposta comercial, sem tabela fictícia:

> Planos sob medida para a sua operação.

O texto explica que módulos e contexto operacional serão entendidos durante a
demonstração. O CTA aponta para o mesmo formulário.

### 5.8 Formulário de demonstração

Campos aprovados, em uma única coluna:

- nome;
- empresa;
- WhatsApp;
- e-mail;
- tamanho da operação.

Validação ocorre no cliente, com mensagens específicas e associadas aos campos.
Ao enviar, a página monta uma mensagem legível e codificada para URL com os dados
informados e abre `https://wa.me/5515998191175?text=...` em uma nova aba.

O botão usa o texto “Conversar sobre uma demonstração”. Uma nota imediatamente
abaixo explica que o visitante será direcionado ao WhatsApp e que o formulário
não envia nem armazena os dados no TJSys.

Se `window.open` for bloqueado, a navegação ocorre na aba atual. Não existe estado
de “enviado” porque o sistema não recebe confirmação do WhatsApp.

### 5.9 FAQ e CTA final

O FAQ responde apenas fatos confirmados:

- para quem é o TJSys.;
- quais áreas podem ser integradas;
- como solicitar a demonstração;
- como os planos são definidos;
- se o formulário armazena os dados.

O CTA final repete a ação principal sem urgência artificial.

## 6. Direção visual

Modo Impeccable: **Persuade**.

A landing estende os tokens azuis existentes, mas recebe composição própria para
marketing:

- azul profundo para autoridade e contraste;
- ciano para conexão, foco e ações comerciais;
- superfícies claras para leitura longa;
- tipografia grande, direta e com largura de linha controlada;
- bordas e sombras discretas, sem glassmorphism genérico;
- fundo com uma malha operacional sutil que sugere módulos conectados;
- uma composição hero assimétrica, com texto dominante e painel de resultado.

O ponto final da marca funciona como detalhe recorrente, não como elemento
decorativo excessivo. A landing não altera os tokens canônicos usados pelo painel;
estilos exclusivos ficam escopados à superfície pública.

## 7. Responsividade e movimento

- Mobile-first, sem rolagem horizontal.
- CTA principal ocupa a largura disponível em telas pequenas.
- Inputs têm fonte mínima de 16 px e alvos de toque de 48 px.
- Navegação mantém acesso a “Entrar” e “Solicite uma demonstração”.
- Animações limitam-se a entrada suave, estados de hover/foco e deslocamentos
  pequenos baseados em `transform` e `opacity`.
- `prefers-reduced-motion: reduce` remove transições não essenciais e qualquer
  rolagem suave.

## 8. Componentes e arquivos previstos

- `frontend/src/marketing/LandingPage.tsx` — composição e conteúdo.
- `frontend/src/marketing/DemoRequestForm.tsx` — validação e URL do WhatsApp.
- `frontend/src/marketing/landing.css` — mundo visual escopado.
- `frontend/src/marketing/LandingPage.test.tsx` — conteúdo, navegação e formulário.
- `frontend/src/app/App.tsx` — divisão pública/autenticada.
- arquivos de navegação e autenticação que contêm destinos absolutos — prefixo
  `/app`.

Componentes podem ser extraídos somente quando tiverem responsabilidade clara;
não dividir cada seção em um arquivo por padrão.

## 9. Cenários de aceite

### Cenário 1 — visitante entende o valor

**Dado** que uma pessoa acessa `/` sem autenticação
**Quando** a landing termina de renderizar
**Então** ela vê a marca TJSys., a promessa principal, os módulos e um CTA para
solicitar demonstração sem ser redirecionada ao login.

### Cenário 2 — usuário acessa o painel

**Dado** um usuário autenticado
**Quando** ele acessa `/app`
**Então** o dashboard é exibido dentro do `AppShell`.

### Cenário 3 — acesso anônimo ao painel

**Dado** um visitante anônimo
**Quando** ele acessa uma rota sob `/app`
**Então** é redirecionado para `/login`.

### Cenário 4 — solicitação pelo WhatsApp

**Dado** que o visitante preenche campos válidos
**Quando** seleciona “Conversar sobre uma demonstração”
**Então** a aplicação abre o WhatsApp do número `5515998191175` com uma mensagem
codificada contendo os dados informados.

### Cenário 5 — formulário inválido

**Dado** um campo obrigatório inválido
**Quando** o visitante tenta continuar
**Então** o foco permanece no formulário e uma mensagem específica, acessível e
associada ao campo orienta a correção.

### Cenário 6 — experiência responsiva e acessível

**Dado** um viewport desktop ou mobile
**Quando** a página é inspecionada
**Então** não há overflow horizontal, todos os controles são alcançáveis por
teclado, o foco é visível e não existem violações axe de impacto crítico ou sério.

## 10. Verificação

- Vitest + Testing Library para rotas, conteúdo, validação e geração do link.
- `jest-axe` no componente renderizado para semântica e violações automatizáveis.
- Playwright para os cenários públicos e protegidos essenciais em viewport desktop
  e mobile.
- `npm.cmd run typecheck`, `npm.cmd run lint` e build do frontend.
- Auditoria Impeccable após implementação, seguida de polish.
- Capturas desktop e mobile para inspecionar hierarquia, overflow e legibilidade.

## 11. Fora do escopo

- modelo ou endpoint de lead comercial;
- CRM, armazenamento de contatos ou painel de leads;
- cobrança, checkout, gateway ou preços públicos;
- depoimentos, logos, métricas ou selos sem evidência;
- rebranding completo das telas autenticadas ainda identificadas como Zyrp;
- alterações nos contratos da API existente.
