"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CaseStatus, Category, Priority, TestCase } from "@/lib/kiwi/types";
import { send } from "@/lib/client-api";
import { formatRequirements, parseRequirements, type RequirementTemplates } from "@/lib/requirements";
import { Field, FormFooter, Select, TextArea, TextInput } from "./form";
import { RequirementChips } from "./requirement-chips";

export interface CaseOptions {
  priorities: Priority[];
  categories: Category[];
  statuses: CaseStatus[];
}

const STATUS_LABEL: Record<string, string> = { PROPOSED: "Proposto", CONFIRMED: "Confirmado", DISABLED: "Desativado", NEED_UPDATE: "Precisa atualizar" };
export const caseStatusLabel = (name: string) => STATUS_LABEL[name] ?? name;

const DEFAULT_TEXT = "1. \n2. \n3. \n\n**Resultado esperado:** ";

export function CaseForm({
  planId,
  testCase,
  options,
  templates,
  onDone,
}: {
  planId: number;
  testCase?: TestCase;
  options: CaseOptions;
  templates: RequirementTemplates;
  onDone: () => void;
}) {
  const router = useRouter();
  const [requirement, setRequirement] = useState(testCase?.requirement ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invalid = parseRequirements(requirement, templates.jiraProject).invalid;
  const confirmed = options.statuses.find((s) => s.name === "CONFIRMED")?.id;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (invalid.length) return setError(`Chave(s) inválida(s): ${invalid.join(", ")}`);
    const f = new FormData(e.currentTarget);
    const values = {
      summary: f.get("summary"),
      text: f.get("text"),
      requirement,
      priority: Number(f.get("priority")),
      category: Number(f.get("category")),
      case_status: Number(f.get("case_status")),
      is_automated: f.get("is_automated") === "on",
    };
    setBusy(true);
    setError(null);
    try {
      if (testCase) await send(`/api/cases/${testCase.id}`, "PATCH", values);
      else await send(`/api/plans/${planId}/cases`, "POST", values);
      router.refresh();
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-3">
      <Field label="Título do caso" className="sm:col-span-3">
        <TextInput name="summary" required maxLength={255} defaultValue={testCase?.summary} autoFocus placeholder="Ex.: Finalizar compra com Pix" />
      </Field>
      <Field
        label="Cards do Jira/Azure"
        className="sm:col-span-3"
        hint={
          invalid.length ? (
            <span className="text-failed">Use azure-86, jira-123 ou cole o link do card, separados por vírgula.</span>
          ) : (
            <RequirementChips value={requirement} templates={templates} />
          )
        }
      >
        <TextInput
          value={requirement}
          onChange={(e) => setRequirement(e.target.value)}
          // Link colado ou formato antigo vira chave ao sair do campo (ex.: ...?workitem=86 ou AB#86 → azure-86).
          onBlur={() => !invalid.length && setRequirement(formatRequirements(parseRequirements(requirement, templates.jiraProject).keys) ?? "")}
          placeholder="azure-86, jira-101 ou link do card"
          aria-invalid={invalid.length > 0}
        />
      </Field>
      <Field label="Prioridade">
        <Select name="priority" defaultValue={testCase?.priority} options={options.priorities.map((p) => ({ value: p.id, label: p.value }))} />
      </Field>
      <Field label="Status">
        <Select name="case_status" defaultValue={testCase?.case_status ?? confirmed} options={options.statuses.map((s) => ({ value: s.id, label: caseStatusLabel(s.name) }))} />
      </Field>
      <Field label="Categoria">
        <Select name="category" defaultValue={testCase?.category} options={options.categories.map((c) => ({ value: c.id, label: c.name === "--default--" ? "Padrão" : c.name }))} />
      </Field>
      <Field label="Passos e resultado esperado" className="sm:col-span-3" hint="Aceita Markdown: **negrito**, listas numeradas.">
        <TextArea name="text" defaultValue={testCase?.text ?? DEFAULT_TEXT} rows={7} />
      </Field>
      <label className="flex items-center gap-2 text-sm sm:col-span-3">
        <input type="checkbox" name="is_automated" defaultChecked={testCase?.is_automated} className="size-4 accent-[var(--accent)]" />
        Coberto por teste automatizado (Cypress)
      </label>
      <div className="sm:col-span-3">
        <FormFooter busy={busy} error={error} submitLabel={testCase ? "Salvar" : "Criar caso"} onCancel={onDone} />
      </div>
    </form>
  );
}
