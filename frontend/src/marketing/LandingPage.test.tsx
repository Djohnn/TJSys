import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'jest-axe'

import LandingPage from './LandingPage'

function renderLanding() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <LandingPage />
    </MemoryRouter>,
  )
}

describe('LandingPage', () => {
  afterEach(() => vi.restoreAllMocks())
  it('renders brand TJSys. and hero headline', () => {
    renderLanding()
    expect(screen.getAllByText(/TJSys\./i).length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /Venda mais/i,
    )
  })

  it('renders all six module cards', () => {
    renderLanding()
    expect(screen.getByText('PDV e vendas')).toBeInTheDocument()
    expect(screen.getByText('Estoque', { selector: 'h3' })).toBeInTheDocument()
    expect(screen.getByText('Compras')).toBeInTheDocument()
    expect(
      screen.getByText('Financeiro', { selector: 'h3' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Fiscal')).toBeInTheDocument()
    expect(screen.getByText('Relatórios e gestão')).toBeInTheDocument()
  })

  it('comunica capacidades operacionais sem prometer atomicidade fiscal', () => {
    renderLanding()
    expect(
      screen.getByText('Saldos por filial e movimentações rastreáveis'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/prepara o contexto fiscal conforme a configuração/i),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/tudo na mesma transação/i),
    ).not.toBeInTheDocument()
  })
  it('exibe somente capacidades fiscais comprovadas', () => {
    renderLanding()
    expect(screen.getByText(/Emissão de NFC-e/i)).toBeInTheDocument()
    expect(screen.queryByText(/CF-e/i)).not.toBeInTheDocument()
  })

  it('renders how-it-works steps', () => {
    renderLanding()
    expect(screen.getByText(/Entendemos sua operação/i)).toBeInTheDocument()
    expect(screen.getByText(/Configuramos empresas/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Sua equipe opera e acompanha tudo em um só lugar/i),
    ).toBeInTheDocument()
  })

  it('renders FAQ items', () => {
    renderLanding()
    expect(screen.getByText('Para quem é o TJSys?')).toBeInTheDocument()
    expect(
      screen.getByText('O formulário armazena meus dados?'),
    ).toBeInTheDocument()
  })

  it('renders login link pointing to /login', () => {
    renderLanding()
    const loginLinks = screen.getAllByRole('link', { name: /entrar/i })
    expect(loginLinks.length).toBeGreaterThan(0)
    for (const link of loginLinks) {
      expect(link).toHaveAttribute('href', '/login')
    }
  })

  it('renders demo form with all fields', () => {
    renderLanding()
    expect(screen.getByLabelText(/Nome/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Empresa/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/WhatsApp/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Tamanho da operação/i)).toBeInTheDocument()
  })

  it('shows validation errors on empty submit', async () => {
    const user = userEvent.setup()
    renderLanding()

    const submitButton = screen.getByRole('button', {
      name: /Conversar sobre uma demonstração/i,
    })
    await user.click(submitButton)

    expect(await screen.findByText(/Informe seu nome/i)).toBeInTheDocument()
    expect(screen.getByText(/Informe o nome da empresa/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Informe um número de WhatsApp/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/Email inválido/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Tamanho da operação/i)).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(screen.getByLabelText(/Tamanho da operação/i)).toHaveAttribute(
      'aria-describedby',
      'demo-size-error',
    )
    expect(
      screen.getByText(/Selecione o tamanho da operação/i),
    ).toBeInTheDocument()
  })

  it('expõe requisitos e associa cada erro ao campo correspondente', async () => {
    const user = userEvent.setup()
    renderLanding()

    // Given: o formulário de demonstração está vazio e seus campos são obrigatórios
    const fields = [
      ['Nome', 'demo-name-error'],
      ['Empresa', 'demo-company-error'],
      ['WhatsApp', 'demo-whatsapp-error'],
      ['Email', 'demo-email-error'],
      ['Tamanho da operação', 'demo-size-error'],
    ] as const
    for (const [label] of fields) {
      expect(screen.getByLabelText(new RegExp(label, 'i'))).toHaveAttribute(
        'aria-required',
        'true',
      )
    }

    // When: a pessoa envia o formulário sem preencher os dados
    await user.click(
      screen.getByRole('button', { name: /Conversar sobre uma demonstração/i }),
    )

    // Then: cada campo inválido aponta para seu erro exclusivo
    for (const [label, errorId] of fields) {
      const field = screen.getByLabelText(new RegExp(label, 'i'))
      expect(field).toHaveAttribute('aria-invalid', 'true')
      expect(field).toHaveAttribute('aria-describedby', errorId)
      expect(document.getElementById(errorId)).toBeInTheDocument()
    }
  })
  it('aceita dados aparados e abre um WhatsApp válido', async () => {
    const user = userEvent.setup()
    const open = vi.spyOn(window, 'open').mockReturnValue(window)
    renderLanding()

    await user.type(screen.getByLabelText(/Nome/i), '  Ana Silva  ')
    await user.type(screen.getByLabelText(/Empresa/i), '  Loja Central  ')
    await user.type(screen.getByLabelText(/WhatsApp/i), '15999887766')
    await user.type(screen.getByLabelText(/Email/i), 'ana@example.com')
    await user.selectOptions(
      screen.getByLabelText(/Tamanho da operação/i),
      'small',
    )
    await user.click(
      screen.getByRole('button', { name: /Conversar sobre uma demonstração/i }),
    )

    expect(open).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/wa\.me\/5515998191175\?text=/),
      '_blank',
      'noopener,noreferrer',
    )
    const url = String(open.mock.calls[0][0])
    expect(decodeURIComponent(url)).toContain('Nome: Ana Silva')
    expect(decodeURIComponent(url)).toContain('Empresa: Loja Central')
    expect(decodeURIComponent(url)).toContain('Operação: Pequena (1-2 lojas)')
  })

  it('rejeita WhatsApp alfabético antes de abrir o link', async () => {
    const user = userEvent.setup()
    const open = vi.spyOn(window, 'open').mockReturnValue(window)
    renderLanding()

    await user.type(screen.getByLabelText(/Nome/i), 'Ana Silva')
    await user.type(screen.getByLabelText(/Empresa/i), 'Loja Central')
    await user.type(screen.getByLabelText(/WhatsApp/i), '15999ABC99')
    await user.type(screen.getByLabelText(/Email/i), 'ana@example.com')
    await user.selectOptions(
      screen.getByLabelText(/Tamanho da operação/i),
      'small',
    )
    await user.click(
      screen.getByRole('button', { name: /Conversar sobre uma demonstração/i }),
    )

    expect(
      await screen.findByText(/apenas números no WhatsApp/i),
    ).toBeInTheDocument()
    expect(open).not.toHaveBeenCalled()
  })

  it('has no axe violations', async () => {
    const { container } = renderLanding()
    const results = await axe(container)
    expect(results.violations).toHaveLength(0)
  })
})
