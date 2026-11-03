"use client";

import { Bot, Check, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { send } from "@/lib/client-api";
import type { Product } from "@/lib/kiwi/types";
import { Dialog } from "./dialog";
import { Field, FormFooter, TextInput } from "./form";
import { ProjectAutomationDialog } from "./project-automation-form";
import { Button } from "./ui";

/** "Novo projeto" na tela Projetos: cria o projeto e oferece configurar a automação em seguida. */
export function NewProjectButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Product | null>(null);
  const [configuring, setConfiguring] = useState<Product | null>(null);

  function close() {
    if (busy) return;
    setOpen(false);
    setName("");
    setError(null);
    setCreated(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { project } = await send<{ project: Product }>("/api/projects", "POST", { name: name.trim() });
      setCreated(project);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Novo projeto
      </Button>
      <Dialog open={open} onClose={close} title={created ? "Projeto criado" : "Novo projeto"} description={created ? undefined : "Um projeto é um sistema testado. Os planos ficam dentro dele."}>
        {created ? (
          <div className="space-y-4">
            <p className="flex items-center gap-2 text-sm">
              <Check className="size-4 text-passed" aria-hidden /> <b>{created.name}</b> foi criado.
            </p>
            <p className="text-sm text-fg-2">Configurar a automação agora? (URL do sistema, como é o login e o usuário de teste. Dá para fazer depois pelo card do projeto.)</p>
            <div className="flex justify-end gap-2">
              <Button onClick={close}>Depois</Button>
              <Button
                variant="primary"
                onClick={() => {
                  const project = created;
                  close();
                  setConfiguring(project);
                }}
              >
                <Bot className="size-4" /> Configurar automação
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            <Field label="Nome do projeto" hint="Ex.: Line, Portal RH, App Mobile">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} required maxLength={64} autoFocus />
            </Field>
            <FormFooter busy={busy} error={error} submitLabel="Criar projeto" onCancel={close} disabled={!name.trim()} />
          </form>
        )}
      </Dialog>
      {configuring && <ProjectAutomationDialog projectId={configuring.id} projectName={configuring.name} current={null} onClose={() => setConfiguring(null)} />}
    </>
  );
}
