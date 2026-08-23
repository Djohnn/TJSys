import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import {
  fetchPublicPlans,
  registerPublic,
  type PublicPlan,
  type PublicRegisterRequest,
} from "./authApi";
import PublicAuthLayout from "./PublicAuthLayout";

type RegisterForm = PublicRegisterRequest;
type FormErrors = Partial<Record<keyof RegisterForm, string>>;

const initialForm: RegisterForm = {
  email: "",
  password: "",
  tenant_name: "",
  company_name: "",
  branch_name: "",
  plan_code: "",
};

function Field({
  id,
  label,
  type = "text",
  value,
  onChange,
  error,
  autoComplete,
  help,
}: {
  id: keyof RegisterForm;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  autoComplete?: string;
  help?: string;
}) {
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-medium text-neutral-800"
      >
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        aria-describedby={
          [help ? helpId : "", error ? errorId : ""]
            .filter(Boolean)
            .join(" ") || undefined
        }
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-primary-700 focus:ring-2 focus:ring-primary-100"
      />
      {help && (
        <p id={helpId} className="mt-1 text-xs text-neutral-600">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-xs text-danger-700">
          {error}
        </p>
      )}
    </div>
  );
}

export default function RegisterPage() {
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState(false);
  const [form, setForm] = useState<RegisterForm>(initialForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function loadPlans() {
    setPlansLoading(true);
    setPlansError(false);
    try {
      const loaded = await fetchPublicPlans();
      setPlans(loaded);
      setForm((current) => ({
        ...current,
        plan_code: current.plan_code || loaded[0]?.code || "",
      }));
    } catch {
      setPlansError(true);
    } finally {
      setPlansLoading(false);
    }
  }

  useEffect(() => {
    void loadPlans();
  }, []);
  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.code === form.plan_code),
    [plans, form.plan_code],
  );

  function updateField(field: keyof RegisterForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setSubmitError(null);
  }

  function validate(): FormErrors {
    const next: FormErrors = {};
    if (!form.email.trim() || !/^\S+@\S+\.\S+$/.test(form.email))
      next.email = "Informe um e-mail válido.";
    if (form.password.length < 12)
      next.password = "A senha deve ter pelo menos 12 caracteres.";
    if (!form.tenant_name.trim())
      next.tenant_name = "Informe o nome do tenant.";
    if (!form.company_name.trim())
      next.company_name = "Informe o nome da empresa.";
    if (!form.branch_name.trim())
      next.branch_name = "Informe o nome da filial principal.";
    if (!form.plan_code) next.plan_code = "Selecione um plano.";
    return next;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = validate();
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await registerPublic(form);
      setSubmitted(true);
    } catch {
      setSubmitError(
        "Não foi possível concluir agora. Revise os dados e tente novamente.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <PublicAuthLayout
        title="Confira seu e-mail"
        description="Falta pouco para ativar seu acesso ao Zyrp."
      >
        <div className="space-y-5" role="status">
          <p className="text-base leading-7 text-neutral-700">
            Se o e-mail puder ser usado, enviaremos um link de confirmação. Abra
            o link para provisionar seu tenant e iniciar o trial de{" "}
            {selectedPlan?.trial_days ?? 0} dias.
          </p>
          <p className="text-sm leading-6 text-neutral-600">
            A mensagem pode levar alguns minutos. Confira também a pasta de
            spam.
          </p>
          <Link
            to="/login"
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-800 focus:outline-none focus:ring-2 focus:ring-primary-100"
          >
            Voltar para o login
          </Link>
        </div>
      </PublicAuthLayout>
    );
  }

  return (
    <PublicAuthLayout
      title="Crie seu acesso"
      description="Comece seu trial sem cartão. Confirmaremos seu e-mail antes de ativar o tenant."
    >
      {plansLoading && (
        <p
          role="status"
          className="mb-5 rounded-lg bg-primary-50 px-4 py-3 text-sm text-primary-800"
        >
          Carregando planos...
        </p>
      )}
      {plansError && (
        <div
          role="alert"
          className="mb-5 rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-900"
        >
          <p>Os planos estão indisponíveis no momento.</p>
          <button
            type="button"
            onClick={() => void loadPlans()}
            className="mt-2 font-semibold underline underline-offset-2"
          >
            Tentar novamente
          </button>
        </div>
      )}
      {!plansLoading && !plansError && plans.length === 0 && (
        <p
          role="status"
          className="mb-5 rounded-lg bg-neutral-100 px-4 py-3 text-sm text-neutral-700"
        >
          Nenhum plano público está disponível agora.
        </p>
      )}
      <form
        onSubmit={onSubmit}
        noValidate
        className="space-y-5"
        aria-busy={submitting || plansLoading}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="email"
            label="E-mail"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(value) => updateField("email", value)}
            error={errors.email}
          />
          <Field
            id="password"
            label="Senha"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(value) => updateField("password", value)}
            error={errors.password}
            help="Use pelo menos 12 caracteres."
          />
          <Field
            id="tenant_name"
            label="Nome do tenant"
            value={form.tenant_name}
            onChange={(value) => updateField("tenant_name", value)}
            error={errors.tenant_name}
            help="É o espaço de trabalho do seu negócio."
          />
          <Field
            id="company_name"
            label="Nome da empresa"
            value={form.company_name}
            onChange={(value) => updateField("company_name", value)}
            error={errors.company_name}
          />
          <Field
            id="branch_name"
            label="Nome da filial principal"
            value={form.branch_name}
            onChange={(value) => updateField("branch_name", value)}
            error={errors.branch_name}
          />
        </div>
        <div>
          <label
            htmlFor="plan_code"
            className="mb-1.5 block text-sm font-medium text-neutral-800"
          >
            Plano
          </label>
          <select
            id="plan_code"
            name="plan_code"
            value={form.plan_code}
            onChange={(event) => updateField("plan_code", event.target.value)}
            disabled={plansLoading || plansError || plans.length === 0}
            aria-invalid={Boolean(errors.plan_code)}
            aria-describedby="plan-help plan-error"
            className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-primary-700 focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:bg-neutral-100"
          >
            <option value="">Selecione um plano</option>
            {plans.map((plan) => (
              <option key={plan.code} value={plan.code}>
                {plan.name} · trial de {plan.trial_days} dias
              </option>
            ))}
          </select>
          <p id="plan-help" className="mt-1 text-xs text-neutral-600">
            O trial começa depois da confirmação do e-mail.
          </p>
          {errors.plan_code && (
            <p id="plan-error" className="mt-1 text-xs text-danger-700">
              {errors.plan_code}
            </p>
          )}
        </div>
        {submitError && (
          <p
            role="alert"
            className="rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-900"
          >
            {submitError}
          </p>
        )}
        <button
          type="submit"
          disabled={
            submitting || plansLoading || plansError || plans.length === 0
          }
          className="min-h-11 w-full rounded-lg bg-primary-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-800 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Criando conta..." : "Criar conta"}
        </button>
        <p className="text-center text-sm text-neutral-600">
          Já tem uma conta?{" "}
          <Link
            to="/login"
            className="font-semibold text-primary-800 underline underline-offset-2"
          >
            Entrar
          </Link>
        </p>
      </form>
    </PublicAuthLayout>
  );
}
