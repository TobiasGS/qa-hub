"use client";

import { ExternalLink, ListTodo, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { send } from "@/lib/client-api";

/** Tarefa "Plano de Teste" no Azure: link para ela, ou botão para criar (planos antigos). */
export function PlanAzureTask({ planId, task, canCreate }: { planId: number; task: { taskId: number; url: string | null } | null; canCreate: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (task) {
    const label = (
      <>
        <ListTodo className="size-3.5" aria-hidden /> Tarefa azure-{task.taskId}
        {task.url && <ExternalLink className="size-3 text-muted" aria-hidden />}
      </>
    );
    const style = "inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-xs font-medium";
    return task.url ? (
      <a href={task.url} target="_blank" rel="noreferrer" className={`${style} hover:border-accent`} title="Tarefa Plano de Teste no Azure DevOps">
        {label}
      </a>
    ) : (
      <span className={style}>{label}</span>
    );
  }
  if (!canCreate) return null;

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await send(`/api/plans/${planId}/azure-task`, "POST");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button onClick={create} disabled={busy} className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-1.5 py-0.5 text-xs font-medium hover:border-accent disabled:opacity-60">
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ListTodo className="size-3.5" />} Criar tarefa no Azure
      </button>
      {error && <span className="text-xs text-failed">{error}</span>}
    </span>
  );
}
