import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import { Button } from './Button'
import { Input } from './Input'

it('expõe botão e campo com semântica acessível', async () => {
  const { container } = render(
    <>
      <Button>Salvar</Button>
      <Input label="Nome" />
    </>
  )
  expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled()
  expect(screen.getByRole('textbox', { name: 'Nome' })).toBeVisible()

  const results = await axe(container)
  expect(results).toHaveNoViolations()
})