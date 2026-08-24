import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { StrictMode } from "react";

import { server } from "@/test/server";
import RegisterPage from "./RegisterPage";
import ConfirmEmailPage from "./ConfirmEmailPage";
import LoginPage from "./LoginPage";
import { AuthContext } from "./AuthProvider";

const BASE = "/api/v1";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function renderPage(ui: ReactNode, initialEntry = "/register") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>{ui}</MemoryRouter>,
  );
}

describe("cadastro público", () => {
  it("carrega planos, envia o payload exato e mostra o sucesso genérico", async () => {
    let requestBody: Record<string, unknown> | undefined;
    server.use(
      http.get(`${BASE}/auth/plans/`, () =>
        HttpResponse.json([
          { code: "starter", name: "Starter", trial_days: 14 },
        ]),
      ),
      http.post(`${BASE}/auth/register/`, async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(null, { status: 202 });
      }),
    );

    const user = userEvent.setup();
    renderPage(<RegisterPage />);

    expect(
      await screen.findByRole("option", { name: /Starter/ }),
    ).toBeVisible();
    await user.type(screen.getByLabelText("E-mail"), "owner@example.com");
    await user.type(screen.getByLabelText("Senha"), "senha-segura-2026");
    await user.type(screen.getByLabelText("Nome do tenant"), "Loja do Bairro");
    await user.type(
      screen.getByLabelText("Nome da empresa"),
      "Loja do Bairro LTDA",
    );
    await user.type(
      screen.getByLabelText("Nome da filial principal"),
      "Matriz",
    );
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    await screen.findByRole("heading", { name: "Confira seu e-mail" });
    expect(requestBody).toEqual({
      email: "owner@example.com",
      password: "senha-segura-2026",
      tenant_name: "Loja do Bairro",
      company_name: "Loja do Bairro LTDA",
      branch_name: "Matriz",
      plan_code: "starter",
    });
    expect(screen.getByText(/se o e-mail puder ser usado/i)).toBeVisible();
  });

  it("bloqueia senha menor que 12 caracteres e mantém a tela no cadastro", async () => {
    server.use(
      http.get(`${BASE}/auth/plans/`, () =>
        HttpResponse.json([
          { code: "starter", name: "Starter", trial_days: 14 },
        ]),
      ),
    );
    const user = userEvent.setup();
    renderPage(<RegisterPage />);
    await screen.findByRole("option", { name: /Starter/ });
    await user.type(screen.getByLabelText("E-mail"), "owner@example.com");
    await user.type(screen.getByLabelText("Senha"), "curta");
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(
      await screen.findByText("A senha deve ter pelo menos 12 caracteres."),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Crie seu acesso" }),
    ).toBeVisible();
  });

  it("mostra o erro de indisponibilidade ao falhar o carregamento dos planos", async () => {
    server.use(
      http.get(`${BASE}/auth/plans/`, () =>
        HttpResponse.json({ detail: "indisponível" }, { status: 503 }),
      ),
    );
    renderPage(<RegisterPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /planos estão indisponíveis/i,
    );
    expect(
      screen.getByRole("button", { name: "Tentar novamente" }),
    ).toBeVisible();
  });
});

test("login oferece navegação pública para criar conta", async () => {
  const user = userEvent.setup();
  const authValue = {
    state: "anonymous" as const,
    user: null,
    memberships: [],
    login: vi.fn(),
    challengeMfa: vi.fn(),
    verifyRecovery: vi.fn(),
    logout: vi.fn(),
  };
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <AuthContext.Provider value={authValue}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<p>destino cadastro</p>} />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
  await user.click(screen.getByRole("link", { name: "Criar conta" }));
  expect(screen.getByText("destino cadastro")).toBeVisible();
});
describe("confirmação de e-mail", () => {
  it("confirma o token e não autentica automaticamente", async () => {
    let requestBody: Record<string, unknown> | undefined;
    let requestCount = 0;
    server.use(
      http.post(`${BASE}/auth/email/confirm/`, async ({ request }) => {
        requestCount += 1;
        requestBody = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    render(
      <StrictMode>
        <MemoryRouter initialEntries={["/confirm-email?token=token-seguro"]}>
          <LocationProbe />
          <ConfirmEmailPage />
        </MemoryRouter>
      </StrictMode>,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "E-mail confirmado" }),
      ).toBeVisible(),
    );
    expect(requestBody).toEqual({ token: "token-seguro" });
    expect(requestCount).toBe(1);
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/confirm-email$/);
    expect(
      screen.getByRole("link", { name: "Ir para o login" }),
    ).toHaveAttribute("href", "/login");
  });

  it("trata token ausente ou expirado sem criar sessão", async () => {
    server.use(
      http.post(`${BASE}/auth/email/confirm/`, () =>
        HttpResponse.json({ detail: "Token expirado" }, { status: 400 }),
      ),
    );
    renderPage(<ConfirmEmailPage />, "/confirm-email?token=expirado");

    expect(
      await screen.findByRole("heading", { name: "Link expirado" }),
    ).toBeVisible();
    expect(screen.getByText(/solicite um novo cadastro/i)).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Voltar para o cadastro" }),
    ).toHaveAttribute("href", "/register");
  });

  it("explica quando a confirmação foi aberta sem token", async () => {
    renderPage(<ConfirmEmailPage />, "/confirm-email");
    expect(
      await screen.findByRole("heading", { name: "Link inválido" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Voltar para o cadastro" }),
    ).toBeVisible();
  });
});
