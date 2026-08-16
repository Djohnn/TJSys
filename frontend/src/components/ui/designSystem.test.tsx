import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Button, { Button as NamedButton } from './Button'
import Card, { Card as NamedCard } from './Card'
import Input from './Input'
import { Alert } from './Alert'
import Badge, { Badge as NamedBadge } from './Badge'
import Modal, { Modal as NamedModal } from './Modal'
import Select from './Select'
import Switch from './Switch'
import Table, { Table as NamedTable } from './Table'
import Tabs from './Tabs'
import Textarea from './Textarea'
import { colors, focus, logoAssets, radii, shadows, spacing, states, typography } from '@/design-system/tokens'

it('expõe botão e campo com semântica acessível', async () => {
  const { container } = render(
    <>
      <NamedButton>Salvar</NamedButton>
      <Input label="Nome" />
    </>
  )
  expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled()
  expect(screen.getByLabelText('Nome')).toBeVisible()

  const results = await axe(container)
  expect(results).toHaveNoViolations()
})

it('expõe o catálogo de primitives com estados e interação por teclado', async () => {
  const user = userEvent.setup()
  const onTabChange = vi.fn()
  const { container } = render(
    <div>
      <Button loading>Salvar</Button>
      <Input label="Nome" error="Nome obrigatório" />
      <Select label="Categoria" options={[{ value: 'food', label: 'Alimentos' }]} disabled />
      <Textarea label="Descrição" error="Descrição obrigatória" />
      <Switch label="Ativo" />
      <Tabs
        tabs={[{ id: 'details', label: 'Detalhes' }, { id: 'history', label: 'Histórico' }]}
        activeTab="details"
        onChange={onTabChange}
      >
        <div>Conteúdo</div>
      </Tabs>
      <Alert variant="error" title="Falha">Não foi possível salvar.</Alert>
      <NamedCard title="Resumo">Conteúdo do card</NamedCard>
      <NamedBadge variant="danger">Bloqueado</NamedBadge>
      <NamedTable headers={['Nome']} rows={[[<span key="1">Produto</span>]]} />
    </div>,
  )

  expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
  expect(screen.getByLabelText('Nome')).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByRole('combobox', { name: 'Categoria' })).toBeDisabled()
  expect(screen.getByLabelText('Descrição')).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByRole('switch', { name: 'Ativo' })).toBeEnabled()
  expect(screen.getByRole('tablist')).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Detalhes' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('alert', { name: 'Falha' })).toHaveTextContent('Não foi possível salvar.')
  expect(screen.getByTestId('card')).toBeInTheDocument()
  expect(screen.getByText('Bloqueado')).toBeInTheDocument()
  expect(screen.getByRole('table')).toBeInTheDocument()

  const historyTab = screen.getByRole('tab', { name: 'Histórico' })
  historyTab.focus()
  await user.keyboard('{Enter}')
  expect(onTabChange).toHaveBeenCalledWith('history')

  const violations = await axe(container)
  expect(violations.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([])
})

it('mantém o contrato de modal nomeado, Escape, foco e retorno', async () => {
  const user = userEvent.setup()
  const onClose = vi.fn()
  const view = render(
    <>
      <button type="button">Abrir</button>
      <Modal open={false} title="Confirmar exclusão" onClose={onClose}>
        <button type="button">Confirmar</button>
      </Modal>
    </>,
  )

  const opener = screen.getByRole('button', { name: 'Abrir' })
  opener.focus()
  view.rerender(
    <>
      <button type="button">Abrir</button>
      <Modal open title="Confirmar exclusão" onClose={onClose}>
        <button type="button">Confirmar</button>
      </Modal>
    </>,
  )
  expect(screen.getByRole('dialog', { name: 'Confirmar exclusão' })).toHaveAttribute('aria-modal', 'true')
  expect(screen.getByRole('button', { name: 'Fechar' })).toBeInTheDocument()
  expect(screen.getByRole('dialog', { name: 'Confirmar exclusão' })).toContainElement(document.activeElement)

  await user.keyboard('{Escape}')
  expect(onClose).toHaveBeenCalledTimes(1)
  view.rerender(
    <>
      <button type="button">Abrir</button>
      <Modal open={false} title="Confirmar exclusão" onClose={onClose}>
        <button type="button">Confirmar</button>
      </Modal>
    </>,
  )
  expect(screen.getByRole('button', { name: 'Abrir' })).toHaveFocus()

  view.rerender(
    <>
      <button type="button">Abrir</button>
      <Modal open title="Confirmar exclusão" onClose={onClose}>
        <button type="button">Confirmar</button>
      </Modal>
    </>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
  expect(onClose).toHaveBeenCalledTimes(2)
})

it('expõe tokens semânticos R1 completos e logos normativos sem alteração de bytes', () => {
  expect(colors.primary[800]).toBe('var(--color-primary-800)')
  expect(colors.success[900]).toBe('var(--color-success-900)')
  expect(colors.gray[900]).toBe('var(--color-gray-900)')
  expect(typography.body).toBe('var(--font-size-md)')
  expect(spacing[4]).toBe('var(--space-4)')
  expect(radii.md).toBe('var(--radius-md)')
  expect(shadows.sm).toBe('var(--shadow-sm)')
  expect(focus.ring).toBe('var(--focus-ring)')
  expect(states.error.text).toBe('var(--color-danger-900)')

  const bluePath = resolve(process.cwd(), 'public', logoAssets.blue.replace(/^\//, ''))
  const whitePath = resolve(process.cwd(), 'public', logoAssets.white.replace(/^\//, ''))
  expect(existsSync(bluePath)).toBe(true)
  expect(existsSync(whitePath)).toBe(true)
  expect(createHash('sha256').update(readFileSync(bluePath)).digest('hex').toUpperCase()).toBe(
    '8DF077FA7F5F87D51C9F0A940F5AE6B670B555A41EB51EA1DE0F90BE1AEA59C2',
  )
  expect(createHash('sha256').update(readFileSync(whitePath)).digest('hex').toUpperCase()).toBe(
    'FC8D7F1E8A0D4882CED8F1996FE4ED829D9EDBD5CEA611ED1DFD44CC23D23BA5',
  )
})

it('expõe grupos normativos critical e module em CSS e TypeScript', () => {
  expect(colors.critical[900]).toBe('var(--color-critical-900)')
  expect(colors.critical[800]).toBe('var(--color-critical-800)')
  expect(colors.critical[100]).toBe('var(--color-critical-100)')
  expect(colors.module.vendas).toBe('var(--color-module-vendas)')
  expect(colors.module.financeiro).toBe('var(--color-module-financeiro)')
  expect(colors.module.compras).toBe('var(--color-module-compras)')
  expect(colors.module.estoque).toBe('var(--color-module-estoque)')
  expect(colors.module.fiscal).toBe('var(--color-module-fiscal)')
  expect(colors.module.pessoas).toBe('var(--color-module-pessoas)')
  expect(colors.module.relatorios).toBe('var(--color-module-relatorios)')
  expect(colors.module.admin).toBe('var(--color-module-admin)')

  const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')
  for (const token of [
    '--color-critical-900', '--color-critical-800', '--color-critical-100',
    '--color-module-vendas', '--color-module-financeiro', '--color-module-compras',
    '--color-module-estoque', '--color-module-fiscal', '--color-module-pessoas',
    '--color-module-relatorios', '--color-module-admin',
  ]) {
    expect(css).toContain(token)
  }
})

it('rejeita classes de cor Tailwind legadas nos primitives governados', () => {
  const legacyColorClass = /(?:bg|text|border)-(?:surface|border|neutral|green|yellow|red|blue)(?:-[0-9]+)?(?:\b|\/)/
  for (const primitive of ['Card.tsx', 'Badge.tsx', 'Table.tsx']) {
    const source = readFileSync(resolve(process.cwd(), 'src/components/ui', primitive), 'utf8')
    expect(source).not.toMatch(legacyColorClass)
  }
})

expect(Button).toBe(NamedButton)
expect(Card).toBe(NamedCard)
expect(Badge).toBe(NamedBadge)
expect(Modal).toBe(NamedModal)
expect(Table).toBe(NamedTable)
