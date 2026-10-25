"use client";

import { Bot, Hand, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Product, TestPlan } from "@/lib/kiwi/types";
import { send } from "@/lib/client-api";
import { parseRequirements, type RequirementTemplates } from "@/lib/requirements";
import { Field, FormFooter, Select, TextArea, TextInput } from "./form";
import { RequirementChips } from "./requirement-chips";
import { Button, cn } from "./ui";

export interface PlanOptions {
  projects: Product[];
}

type Kind = "manual" | "automated";
const NEW_PROJECT = "__new";

export function PlanForm({ plan, options, templates, onDone }: { plan?: TestPlan; options: PlanOptions; templates: RequirementTemplates; onDone: () => void }) {
  const router = useRouter();
  const [projects, setProjects] = useState(options.projects);
  const [project, setProject] = useState(String(plan?.product ?? options.projects[0]?.id ?? NEW_PROJECT));
  const [newProject, setNewProject] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const [kind, setKind] = useState<Kind>(plan?.type__name === "Automatizado" ? "automated" : "manual");
  // O Kiwi guarda a URL do card; no formulário mostramos a chave (AB#86), mais fácil de ler.
  const [link, setLink] = useState(plan?.extra_link ? (parseRequirements(plan.extra_link).keys[0] ?? plan.extra_link) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addProject() {
    if (!newProject.trim()) return;
    setCreatingProject(true);
    setError(null);
    try {
      const { project: created } = await send<{ project: Product }>("/api/projects", "POST", { name: newProject.trim() });
      setProjects((p) => [...p, created].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
      setProject(String(created.id));
      setNewProject("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreatingProject(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (project === NEW_PROJECT) return setError("Crie o projeto (botão Adicionar) ou escolha um da lista");
    const f = new FormData(e.currentTarget);
    const values = { name: f.get("name"), text: f.get("text"), product: Number(project), type: kind, extra_link: link };
    setBusy(true);
    setError(null);
    try {
      if (plan) {
        await send(`/api/plans/${plan.id}`, "PATCH", values);
        router.refresh();
      } else {
        const { plan: created } = await send<{ plan: TestPlan }>("/api/plans", "POST", values);
        router.push(`/plans/${created.id}`);
      }
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Nome do plano" className="sm:col-span-2">
        <TextInput name="name" required maxLength={255} defaultValue={plan?.name} autoFocus placeholder="Ex.: Checkout — regressão" />
      </Field>

      <div className="sm:col-span-2">
        <Field label="Projeto">
          <Select
            value={project}
            onChange={(e) => setProject(e.target.value)}
            options={[...projects.map((p) => ({ value: String(p.id), label: p.name })), { value: NEW_PROJECT, label: "+ Projeto…" }]}
          />
        </Field>
        {project === NEW_PROJECT && (
          <div className="mt-2 flex gap-2">
            <TextInput
              value={newProject}
              onChange={(e) => setNewProject(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addProject();
                }
              }}
              placeholder="Nome do novo projeto"
              maxLength={64}
              autoFocus
            />
            <Button type="button" onClick={addProject} disabled={creatingProject || !newProject.trim()}>
              {creatingProject && <Loader2 className="size-4 animate-spin" />} Adicionar
            </Button>
          </div>
        )}
      </div>

      <div className="sm:col-span-2">
        <span className="text-xs font-medium text-fg-2">Tipo</span>
        <div className="mt-1 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo do plano">
          {(
            [
              { value: "manual", label: "Manual", icon: Hand, hint: "Executado por pessoas" },
              { value: "automated", label: "Automatizado", icon: Bot, hint: "Cypress / CI" },
            ] as const
          ).map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={kind === o.value}
              onClick={() => setKind(o.value)}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition",
                kind === o.value ? "border-accent bg-accent/10" : "border-border hover:bg-surface-2",
              )}
            >
              <o.icon className={cn("size-5", kind === o.value ? "text-accent" : "text-muted")} aria-hidden />
              <span>
                <span className="block text-sm font-medium">{o.label}</span>
                <span className="block text-xs text-muted">{o.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <Field
        label="Card do épico/feature"
        className="sm:col-span-2"
        hint={parseRequirements(link).keys.length ? <RequirementChips value={link} templates={templates} /> : "Os bugs abertos neste plano ficam ligados a este card."}
      >
        <TextInput name="extra_link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="AB#86, SHOP-100 ou link do card" />
      </Field>
      <Field label="Descrição" className="sm:col-span-2" hint="Escopo, ambiente, critérios de aceite. Aceita Markdown.">
        <TextArea name="text" defaultValue={plan?.text} rows={4} />
      </Field>
      <div className="sm:col-span-2">
        <FormFooter busy={busy} error={error} submitLabel={plan ? "Salvar" : "Criar plano"} onCancel={onDone} />
      </div>
    </form>
  );
}
