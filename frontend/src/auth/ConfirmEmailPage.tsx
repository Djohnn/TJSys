import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { confirmEmail } from "./authApi";
import PublicAuthLayout from "./PublicAuthLayout";

type ConfirmationState = "confirming" | "success" | "expired" | "error";

export default function ConfirmEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const started = useRef(false);
  const [state, setState] = useState<ConfirmationState>(
    token ? "confirming" : "error",
  );

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    confirmEmail(token)
      .then(() => setState("success"))
      .catch((error: unknown) => {
        const status =
          error && typeof error === "object" && "problem" in error
            ? (error.problem as { status?: number }).status
            : undefined;
        setState(status === 400 ? "expired" : "error");
      });
  }, [token]);

  if (state === "confirming")
    return (
      <PublicAuthLayout
        title="Confirmando seu e-mail"
        description="Estamos validando seu link com segurança."
      >
        <p role="status" className="text-sm text-neutral-700">
          Aguarde um instante...
        </p>
      </PublicAuthLayout>
    );
  if (state === "success")
    return (
      <PublicAuthLayout
        title="E-mail confirmado"
        description="Seu cadastro foi ativado com segurança."
      >
        <div className="space-y-5">
          <p className="text-base leading-7 text-neutral-700">
            Seu tenant está pronto para o trial. Entre com seu e-mail e senha; o
            MFA continuará sendo uma etapa explícita do acesso.
          </p>
          <Link
            to="/login"
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-800 focus:outline-none focus:ring-2 focus:ring-primary-100"
          >
            Ir para o login
          </Link>
        </div>
      </PublicAuthLayout>
    );
  if (state === "expired")
    return (
      <PublicAuthLayout
        title="Link expirado"
        description="Este link de confirmação não pode mais ser usado."
      >
        <div className="space-y-5">
          <p className="text-base leading-7 text-neutral-700">
            Por segurança, solicite um novo cadastro para receber outro link de
            confirmação.
          </p>
          <Link
            to="/register"
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-800 focus:outline-none focus:ring-2 focus:ring-primary-100"
          >
            Voltar para o cadastro
          </Link>
        </div>
      </PublicAuthLayout>
    );
  return (
    <PublicAuthLayout
      title={token ? "Não foi possível confirmar" : "Link inválido"}
      description="Não criamos uma sessão automaticamente."
    >
      <div className="space-y-5">
        <p role="alert" className="text-base leading-7 text-neutral-700">
          O link está incompleto ou não pôde ser validado. Solicite um novo
          cadastro para continuar.
        </p>
        <Link
          to="/register"
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-800 focus:outline-none focus:ring-2 focus:ring-primary-100"
        >
          Voltar para o cadastro
        </Link>
      </div>
    </PublicAuthLayout>
  );
}
