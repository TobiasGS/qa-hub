"use client";

import { Bot, Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { send } from "@/lib/client-api";
import { Dialog } from "./dialog";
import { Field, FormFooter, TextInput } from "./form";
import { Button } from "./ui";

interface Login {
  path: string;
  userLabel: string;
  passwordLabel: string;
  submitLabel: string;
  successUrl: string;
}
export interface AutomationView {
  baseUrl: string;
  folder: string;
  login: Login;
  user: string;
  hasPassword: boolean;
  updatedAt: string;
  updatedBy: string;
}

const DEFAULT_LOGIN: Login = { path: "/login", userLabel: "Usuário", passwordLabel: "Senha", submitLabel: "Entrar", successUrl: "" };
const slug = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/** "Configurar automação" de um projeto: o botão que abre o formulário. */
export function ProjectAutomationButton({ projectId, projectName, current }: { projectId: number; projectName: string; current: AutomationView | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        {current ? <Settings className="size-4" /> : <Bot className="size-4" />} {current ? "Editar automação" : "Configurar automação"}
      </Button>
      {open && <ProjectAutomationDialog projectId={projectId} projectName={projectName} current={current} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Formulário de automação: sistema a testar, como é o login e o usuário de teste. */
export function ProjectAutomationDialog({
  projectId,
  projectName,
  current,
  onClose,
}: {
  projectId: number;
  projectName: string;
  current: AutomationView | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState(() => ({
    baseUrl: current?.baseUrl ?? "",
    folder: current?.folder ?? slug(projectName),
    login: current?.login ?? DEFAULT_LOGIN,
    user: current?.user ?? "",
    password: "",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const setLogin = (patch: Partial<Login>) => setForm((f) => ({ ...f, login: { ...f.login, ...patch } }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await send(`/api/projects/${projectId}/automation`, "PUT", form);
      onClose();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog open onClose={() => !busy && onClose()} title={`Automação · ${projectName}`} description="Sistema que os testes automatizados abrem e o usuário que eles usam." wide>
        <form onSubmit={onSubmit} className="space-y-5">
          <fieldset className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <Field label="URL do sistema (ambiente de teste)" hint="Ex.: https://sistema.homologacao.empresa.com.br">
              <TextInput value={form.baseUrl} onChange={(e) => set({ baseUrl: e.target.value })} required type="url" placeholder="https://" />
            </Field>
            <Field label="Pasta dos testes" hint={`No qa-automacao: tests/${form.folder || "…"}/`}>
              <TextInput value={form.folder} onChange={(e) => set({ folder: e.target.value.toLowerCase() })} required pattern="[a-z0-9][a-z0-9-]*" maxLength={40} />
            </Field>
          </fieldset>

          <fieldset className="space-y-3 rounded-lg border border-border p-4">
            <legend className="px-1 text-xs font-medium text-fg-2">Tela de login (os textos como aparecem na tela)</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Caminho da tela de login">
                <TextInput value={form.login.path} onChange={(e) => setLogin({ path: e.target.value })} required placeholder="/login" />
              </Field>
              <Field label="Endereço depois de entrar" hint="Opcional. Ex.: /dashboard">
                <TextInput value={form.login.successUrl} onChange={(e) => setLogin({ successUrl: e.target.value })} placeholder="/dashboard" />
              </Field>
              <Field label="Rótulo do campo de usuário">
                <TextInput value={form.login.userLabel} onChange={(e) => setLogin({ userLabel: e.target.value })} required />
              </Field>
              <Field label="Rótulo do campo de senha">
                <TextInput value={form.login.passwordLabel} onChange={(e) => setLogin({ passwordLabel: e.target.value })} required />
              </Field>
              <Field label="Texto do botão de entrar">
                <TextInput value={form.login.submitLabel} onChange={(e) => setLogin({ submitLabel: e.target.value })} required />
              </Field>
            </div>
          </fieldset>

          <fieldset className="grid gap-3 sm:grid-cols-2">
            <Field label="Usuário de teste">
              <TextInput value={form.user} onChange={(e) => set({ user: e.target.value })} required autoComplete="off" />
            </Field>
            <Field label="Senha do usuário de teste" hint={current?.hasPassword ? "Senha salva (criptografada). Deixe em branco para manter." : "Fica guardada criptografada no QA Hub."}>
              <TextInput
                value={form.password}
                onChange={(e) => set({ password: e.target.value })}
                type="password"
                autoComplete="new-password"
                required={!current?.hasPassword}
                placeholder={current?.hasPassword ? "••••••••" : ""}
              />
            </Field>
          </fieldset>

          {current && (
            <p className="text-xs text-muted">
              Última alteração por {current.updatedBy} em {new Date(current.updatedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.
            </p>
          )}
          <FormFooter busy={busy} error={error} submitLabel="Salvar" onCancel={onClose} />
        </form>
      </Dialog>
    </>
  );
}
