import { Link } from 'react-router-dom'

import DemoRequestForm from './DemoRequestForm'
import './landing.css'

const MODULES = [
  {
    id: 'pdv',
    label: 'PDV e vendas',
    description:
      'Venda balcão, pedidos e comandas com baixa automática de estoque.',
    color: 'bg-primary-100 text-primary-700',
    icon: 'M4 7h16l-1.5 13h-13zM8 7a4 4 0 0 1 8 0',
  },
  {
    id: 'estoque',
    label: 'Estoque',
    description: 'Saldos, transferências, lotes e inventário por filial.',
    color: 'bg-success-100 text-success-700',
    icon: 'm4 8 8-4 8 4-8 4zM4 8v8l8 4 8-4V8M12 12v8',
  },
  {
    id: 'compras',
    label: 'Compras',
    description: 'Pedidos a fornecedores, cotações e devoluções integradas.',
    color: 'bg-warning-100 text-warning-800',
    icon: 'M5 6h16l-2 8H8L5 3H2m7 15a1 1 0 1 0 0 2 1 1 0 0 0 0-2m9 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2',
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    description:
      'Contas a pagar e receber, fluxo de caixa e conciliação bancária.',
    color: 'bg-info-100 text-info-700',
    icon: 'M12 3v18m5-14.5c-1-1-2.5-1.5-5-1.5-3 0-5 1.5-5 3.5 0 5 10 2 10 7 0 2-2 3.5-5 3.5-2.5 0-4-.5-5-1.5',
  },
  {
    id: 'fiscal',
    label: 'Fiscal',
    description: 'Emissão de NFC-e e rastreabilidade de documentos.',
    color: 'bg-danger-100 text-danger-700',
    icon: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5h6',
  },
  {
    id: 'relatorios',
    label: 'Relatórios e gestão',
    description:
      'DRE, relatórios de vendas, estoque e indicadores operacionais.',
    color: 'bg-neutral-100 text-neutral-700',
    icon: 'M4 20V10h4v10zm6 0V4h4v16zm6 0v-7h4v7z',
  },
]

const STEPS = [
  { num: 1, text: 'Entendemos sua operação em uma demonstração.' },
  { num: 2, text: 'Configuramos empresas, filiais e os módulos necessários.' },
  { num: 3, text: 'Sua equipe opera e acompanha tudo em um só lugar.' },
]

const FAQ_ITEMS = [
  {
    q: 'Para quem é o TJSys?',
    a: 'Pequenos e médios varejistas que precisam integrar PDV, estoque, compras, financeiro e fiscal em um único sistema.',
  },
  {
    q: 'Quais áreas podem ser integradas?',
    a: 'Catálogo, PDV, estoque, compras, financeiro, fiscal, relatórios e gestão. Os módulos são configurados conforme a necessidade da operação.',
  },
  {
    q: 'Como solicitar a demonstração?',
    a: 'Preencha o formulário nesta página. Você será direcionado ao WhatsApp para conversar diretamente com a equipe comercial.',
  },
  {
    q: 'Como os planos são definidos?',
    a: 'Planos sob medida para a sua operação. Módulos, contextos e necessidades são entendidos durante a demonstração.',
  },
  {
    q: 'O formulário armazena meus dados?',
    a: 'Não. Os dados permanecem apenas no seu navegador até a abertura do WhatsApp. Nada é enviado ao TJSys.',
  },
]

export default function LandingPage() {
  return (
    <div className="landing-grid-bg min-h-screen">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-surface/95 backdrop-blur border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link
            to="/"
            className="text-xl font-bold text-primary-800 no-underline"
          >
            TJSys.
          </Link>

          <nav
            className="hidden md:flex items-center gap-6 text-sm text-neutral-600"
            aria-label="Navegação principal"
          >
            <a
              href="#solucao"
              className="hover:text-primary-700 transition-colors"
            >
              Solução
            </a>
            <a
              href="#modulos"
              className="hover:text-primary-700 transition-colors"
            >
              Módulos
            </a>
            <a
              href="#como-funciona"
              className="hover:text-primary-700 transition-colors"
            >
              Como funciona
            </a>
            <a
              href="#planos"
              className="hover:text-primary-700 transition-colors"
            >
              Planos
            </a>
            <a
              href="#duvidas"
              className="hover:text-primary-700 transition-colors"
            >
              Dúvidas
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm font-medium text-primary-700 hover:text-primary-800 no-underline"
            >
              Entrar
            </Link>
            <a href="#demo" className="landing-cta text-sm py-2 px-4">
              Solicite uma demonstração
            </a>
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero ──────────────────────────────────────────── */}
        <section className="landing-section" id="solucao">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="landing-animate-in">
                <p className="text-sm font-semibold text-primary-600 mb-3 tracking-wide uppercase">
                  ERP para varejo em movimento
                </p>
                <h1 className="text-4xl sm:text-5xl font-extrabold text-neutral-900 leading-tight mb-6">
                  Venda mais, sem perder o controle do estoque.
                </h1>
                <p className="text-lg text-neutral-600 mb-8 max-w-lg leading-relaxed">
                  O TJSys conecta PDV, estoque, compras e financeiro em um só
                  lugar para sua equipe operar com clareza, sem planilhas e sem
                  surpresas.
                </p>
                <div className="flex flex-wrap gap-3">
                  <a href="#demo" className="landing-cta">
                    Solicite uma demonstração
                  </a>
                  <a
                    href="#modulos"
                    className="landing-cta landing-cta-secondary"
                  >
                    Conheça os módulos
                  </a>
                </div>
              </div>

              <div
                className="landing-hero-visual landing-animate-in"
                style={{ animationDelay: '0.15s' }}
              >
                <div className="landing-hero-card">
                  <div className="metric">PDV</div>
                  <div className="metric-label">
                    Vendas integradas ao estoque
                  </div>
                </div>
                <div className="landing-hero-card">
                  <div className="metric">Estoque</div>
                  <div className="metric-label">
                    Saldos por filial e movimentações rastreáveis
                  </div>
                </div>
                <div className="landing-hero-card">
                  <div className="metric">Financeiro</div>
                  <div className="metric-label">Caixa e contas conciliados</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Trust badges ──────────────────────────────────── */}
        <section className="py-8 border-y border-border bg-surface">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-3">
              <div className="trust-badge">
                <span className="trust-badge-dot" /> Operação integrada
              </div>
              <div className="trust-badge">
                <span className="trust-badge-dot" /> Visão por empresa e filial
              </div>
              <div className="trust-badge">
                <span className="trust-badge-dot" /> Rastreabilidade entre
                módulos
              </div>
              <div className="trust-badge">
                <span className="trust-badge-dot" /> PDV e gestão no mesmo
                ecossistema
              </div>
            </div>
          </div>
        </section>

        {/* ── Problem / Solution ────────────────────────────── */}
        <section className="landing-section landing-section-alt">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
            <h2 className="text-3xl font-bold text-neutral-900 mb-6">
              Sua operação não deveria ser uma coleção de planilhas soltas.
            </h2>
            <p className="text-lg text-neutral-600 leading-relaxed mb-4">
              Venda registrada em um sistema, estoque em planilha, contas a
              pagar no caderno. Quando alguém pergunta &ldquo;tem
              estoque?&rdquo;, ninguém tem certeza.
            </p>
            <p className="text-lg text-neutral-600 leading-relaxed">
              O TJSys conecta cada área. Uma venda no PDV atualiza estoque, gera
              movimento de caixa e prepara o contexto fiscal conforme a
              configuração da operação — sem retrabalho.
            </p>
          </div>
        </section>

        {/* ── Modules ───────────────────────────────────────── */}
        <section className="landing-section" id="modulos">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <h2 className="text-3xl font-bold text-neutral-900 text-center mb-4">
              Tudo que sua operação precisa.
            </h2>
            <p className="text-neutral-600 text-center mb-12 max-w-2xl mx-auto">
              Seis módulos que trabalham juntos para eliminar retrabalho e dar
              visibilidade completa ao negócio.
            </p>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {MODULES.map((mod) => (
                <div key={mod.id} className="module-card">
                  <div className={`module-card-icon ${mod.color}`}>
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      className="h-5 w-5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d={mod.icon}
                      />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-neutral-900 mb-2">
                    {mod.label}
                  </h3>
                  <p className="text-sm text-neutral-600 leading-relaxed">
                    {mod.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ──────────────────────────────────── */}
        <section
          className="landing-section landing-section-alt"
          id="como-funciona"
        >
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <h2 className="text-3xl font-bold text-neutral-900 text-center mb-12">
              Como funciona
            </h2>

            <div className="space-y-8">
              {STEPS.map((step) => (
                <div key={step.num} className="flex items-start gap-4">
                  <div className="step-number">{step.num}</div>
                  <p className="text-lg text-neutral-700 pt-1.5">{step.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Plans ─────────────────────────────────────────── */}
        <section className="landing-section" id="planos">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
            <h2 className="text-3xl font-bold text-neutral-900 mb-6">
              Planos sob medida para a sua operação.
            </h2>
            <p className="text-lg text-neutral-600 mb-8 leading-relaxed">
              Módulos e contexto operacional serão entendidos durante a
              demonstração. Sem tabela fixa, sem surpresas.
            </p>
            <a href="#demo" className="landing-cta">
              Solicite uma demonstração
            </a>
          </div>
        </section>

        {/* ── Demo Form ─────────────────────────────────────── */}
        <section className="landing-section landing-section-alt" id="demo">
          <div className="max-w-lg mx-auto px-4 sm:px-6">
            <h2 className="text-3xl font-bold text-neutral-900 text-center mb-2">
              Solicite uma demonstração
            </h2>
            <p className="text-neutral-600 text-center mb-8">
              Preencha os dados abaixo e conversaremos pelo WhatsApp.
            </p>
            <div className="bg-surface rounded-xl border border-border p-6 sm:p-8 shadow-sm">
              <DemoRequestForm id="demo-form" />
            </div>
          </div>
        </section>

        {/* ── FAQ ───────────────────────────────────────────── */}
        <section className="landing-section" id="duvidas">
          <div className="max-w-2xl mx-auto px-4 sm:px-6">
            <h2 className="text-3xl font-bold text-neutral-900 text-center mb-8">
              Dúvidas frequentes
            </h2>

            <div className="space-y-3">
              {FAQ_ITEMS.map((item) => (
                <details
                  key={item.q}
                  className="faq-item bg-surface border border-border rounded-lg p-4"
                >
                  <summary className="font-medium text-neutral-900">
                    {item.q}
                  </summary>
                  <p className="text-neutral-600 mt-3 leading-relaxed">
                    {item.a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA final ─────────────────────────────────────── */}
        <section className="landing-section landing-section-alt">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
            <h2 className="text-3xl font-bold text-neutral-900 mb-4">
              Pronto para simplificar sua operação?
            </h2>
            <p className="text-neutral-600 mb-8">
              Fale com a equipe e descubra como o TJSys pode se encaixar no seu
              dia a dia.
            </p>
            <a href="#demo" className="landing-cta">
              Solicite uma demonstração
            </a>
          </div>
        </section>
      </main>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer className="border-t border-border bg-surface py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-neutral-500">
            &copy; {new Date().getFullYear()} TJSys. Todos os direitos
            reservados.
          </p>
          <div className="flex gap-4 text-sm text-neutral-500">
            <Link to="/login" className="hover:text-primary-700 no-underline">
              Entrar
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
