# Catálogo — Shell de Referência com Identidade Zyrp

## Objetivo

Corrigir a divergência entre o frontend entregue e o layout aprovado. O sistema deve adotar a estrutura de navegação da referência fornecida pelo usuário, sem copiar a marca ou a paleta do MarketUP. A identidade visual continua sendo Zyrp.

## Direção visual aprovada

- Estética operacional, densa e direta, adequada a um ERP usado durante todo o expediente.
- Navegação lateral com duas colunas: uma faixa estreita de módulos e um painel contextual expandido.
- Cores derivadas dos tokens Zyrp: azul profundo como base, azul vivo para seleção, branco para conteúdo e acento ciano.
- Tipografia e ícones legíveis; nenhum logotipo, verde ou ativo proprietário do sistema de referência será copiado.
- O conteúdo principal permanece claro, com alto contraste, largura fluida e hierarquia compacta.

## Shell desktop

Em viewports a partir de 1024 px, o shell terá:

1. **Faixa de módulos, 88 px:** marca Zyrp no topo e atalhos verticais com ícone + rótulo para Início, Favoritos, Catálogo, Vendas, Estoque, Compras, Financeiro, Relatórios e Administração.
2. **Painel contextual, 248 px:** ao estar em qualquer rota `/catalog`, mostra o título “Catálogo” e links Produtos, Serviços, Combo, Categorias, Marcas, Unidades de Medida e Impressão de Etiquetas.
3. **Área principal:** cabeçalho com contexto administrativo, seletor de tenant e saída; conteúdo abaixo sem o excesso de margem dupla atual.

O módulo e o submenu ativos devem ter `aria-current="page"`, contraste perceptível e indicação visual que não dependa apenas de cor.

## Shell mobile e tablet

- Abaixo de 1024 px, as duas colunas laterais ficam recolhidas.
- Um botão “Abrir menu” no cabeçalho abre um drawer único contendo módulos e submenu do Catálogo.
- O drawer fecha ao selecionar um destino, por botão explícito, pela tecla Escape ou pelo backdrop.
- O foco retorna ao botão de abertura após fechar; o conteúdo não deve causar rolagem horizontal em 360 px.

## Catálogo

- `/catalog` deixa de usar cartões genéricos como navegação principal. A página vira uma apresentação compacta do módulo, com título, resumo operacional e atalhos de continuidade; a navegação canônica fica no painel contextual.
- Todas as sete opções solicitadas ficam sempre visíveis no painel contextual em desktop e no drawer em mobile.
- Rotas e APIs existentes não mudam.

## Cadastro de produto — padrão B

- Em desktop, o painel de imagem fica à esquerda e o bloco de identificação à direita na primeira dobra.
- As etapas Identificação, Preços, Estoque, Fiscal, Composição e Canais permanecem disponíveis e semanticamente marcadas como abas.
- Em telas estreitas, imagem, identificação e etapas empilham nessa ordem.
- Estados de carregamento, erro, validação e salvamento continuam funcionais.

## Componentes e responsabilidades

- `Navigation.tsx`: modelo de módulos, submenu contextual, estado ativo e renderização desktop/drawer.
- `AppShell.tsx`: composição do shell, controle do drawer, cabeçalho e região principal.
- `CatalogHomePage.tsx`: entrada compacta do catálogo, sem duplicar o painel lateral.
- Estilos globais/tokens: apenas variáveis e utilitários necessários ao novo shell; sem biblioteca visual adicional.

## Acessibilidade

- Landmarks `nav`, `header` e `main` preservados.
- Botões com nomes acessíveis, estados `aria-expanded`/`aria-controls` e foco visível.
- Contraste mínimo WCAG AA e navegação completa por teclado.
- Respeitar `prefers-reduced-motion` nas transições do drawer e realces.

## Critérios de aceite

1. A estrutura desktop é reconhecível como a referência: faixa de módulos + painel contextual + conteúdo.
2. A paleta e a marca são exclusivamente Zyrp.
3. As sete opções de Catálogo aparecem no painel contextual e navegam para as rotas existentes.
4. O cadastro exibe mídia à esquerda e identificação à direita em desktop.
5. Em 360 px não há rolagem horizontal e o menu funciona por teclado.
6. Testes Vitest do shell e catálogo passam; TypeScript e build passam.
7. Playwright passa em Chromium, Firefox e WebKit nas resoluções desktop e mobile.
8. Inspeção visual manual no navegador confirma login, shell, catálogo, editor e responsividade.

## Fora de escopo

- Alterar backend, contratos de API ou regras de negócio.
- Reestilizar integralmente todos os módulos fora do shell compartilhado.
- Copiar logotipo, verde, textos promocionais ou ativos do MarketUP.
