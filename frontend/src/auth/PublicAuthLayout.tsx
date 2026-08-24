import type { ReactNode } from "react";

interface PublicAuthLayoutProps {
  children: ReactNode;
  title: string;
  description: string;
}

export default function PublicAuthLayout({
  children,
  title,
  description,
}: PublicAuthLayoutProps) {
  return (
    <main className="min-h-screen bg-neutral-100 px-4 py-6 text-neutral-900 sm:px-6 sm:py-10">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl overflow-hidden rounded-2xl bg-surface shadow-lg md:grid-cols-[0.9fr_1.1fr]">
        <aside className="relative hidden overflow-hidden bg-primary-900 p-10 text-white md:flex md:flex-col md:justify-between">
          <div
            aria-hidden="true"
            className="absolute -right-20 -top-20 h-64 w-64 rounded-full border-[28px] border-primary-700/50"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full border-[34px] border-primary-700/40"
          />
          <div className="relative">
            <p className="text-lg font-semibold tracking-tight">Zyrp</p>
            <p className="mt-14 max-w-xs text-3xl font-semibold leading-tight">
              Seu negócio mais claro, todos os dias.
            </p>
            <p className="mt-5 max-w-sm text-sm leading-6 text-primary-100">
              Organize vendas, estoque e financeiro em um só lugar, com uma
              operação pronta para crescer.
            </p>
          </div>
          <p className="relative max-w-xs text-sm leading-6 text-primary-100">
            Comece com um período de teste e confirme seu e-mail para ativar o
            acesso.
          </p>
        </aside>
        <section
          className="flex items-center p-6 sm:p-10 lg:p-14"
          aria-labelledby="public-auth-title"
        >
          <div className="mx-auto w-full max-w-xl">
            <div className="mb-8 md:hidden">
              <p className="text-lg font-semibold tracking-tight text-primary-800">
                Zyrp
              </p>
            </div>
            <h1
              id="public-auth-title"
              className="text-3xl font-semibold tracking-tight text-neutral-900"
            >
              {title}
            </h1>
            <p className="mt-2 max-w-lg text-sm leading-6 text-neutral-600">
              {description}
            </p>
            <div className="mt-8">{children}</div>
          </div>
        </section>
      </div>
    </main>
  );
}
