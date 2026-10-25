"use client";

import { AlertTriangle, CornerDownRight, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { LinkReference } from "@/lib/kiwi/types";
import { send } from "@/lib/client-api";
import { Dialog } from "./dialog";
import { Field, FormFooter, Select, TextArea, TextInput } from "./form";

interface Target {
  destination: "azure" | "kiwi";
  card: string | null;
  caseTitle: string;
  parentTitle?: string;
  parentType?: string;
  warning?: string;
  /** Não dá para criar (sem PAT, sem rede ou sem acesso ao card). */
  blocked?: boolean;
}

const SEVERITY_OPTIONS = [
  { value: "1 - Critical", label: "1 - Crítica" },
  { value: "2 - High", label: "2 - Alta" },
  { value: "3 - Medium", label: "3 - Média" },
  { value: "4 - Low", label: "4 - Baixa" },
];

/** "Abrir bug": o destino vem do card do plano (Azure → filho do card; senão, tracker do Kiwi). */
export function BugDialog({ executionId, open, onClose, onCreated }: { executionId: number; open: boolean; onClose: () => void; onCreated: (link: LinkReference) => void }) {
  const [target, setTarget] = useState<Target | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTarget(null);
    setLoadError(null);
    setError(null);
    send<Target>(`/api/executions/${executionId}/bug-target`, "GET").then(setTarget, (e) => setLoadError((e as Error).message));
  }, [open, executionId]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    // Abre a aba já no clique; depois do await o navegador bloquearia como popup.
    const tab = window.open("about:blank", "_blank");
    try {
      const { link } = await send<{ link: LinkReference }>(`/api/executions/${executionId}/bug`, "POST", {
        title: f.get("title"),
        severity: f.get("severity"),
        notes: f.get("notes"),
      });
      onCreated(link);
      if (tab) {
        tab.opener = null;
        tab.location.href = link.url;
      }
      onClose();
    } catch (err) {
      tab?.close();
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Abrir bug" wide>
      {!target && !loadError && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" /> Verificando o card do plano…
        </p>
      )}
      {loadError && <p className="text-sm text-failed">{loadError}</p>}
      {target && (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm">
            {target.destination === "azure" ? (
              <p className="flex items-start gap-2">
                <CornerDownRight className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                <span>
                  Será criado no <b>Azure DevOps</b> como filho de <b>{target.card}</b>
                  {target.parentTitle && (
                    <>
                      {" "}
                      — {target.parentType && <span className="text-muted">{target.parentType}: </span>}
                      {target.parentTitle}
                    </>
                  )}
                  , na mesma sprint.
                </span>
              </p>
            ) : (
              <p>
                Será aberto no bug tracker configurado no Kiwi{target.card ? ` (o card do plano é ${target.card})` : " (o plano não tem card)"}.
              </p>
            )}
            {target.warning && (
              <p className="mt-2 flex items-start gap-2 text-xs text-fg-2">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-blocked" aria-hidden /> {target.warning}
              </p>
            )}
          </div>

          {target.destination === "azure" ? (
            <>
              <Field label="Título do bug">
                <TextInput name="title" required maxLength={255} defaultValue={`[QA] ${target.caseTitle}`} autoFocus />
              </Field>
              <Field label="Severidade">
                <Select name="severity" defaultValue="3 - Medium" options={SEVERITY_OPTIONS} />
              </Field>
              <Field label="Observações" hint="Passos do caso, comentários da execução, evidências e build entram sozinhos na descrição.">
                <TextArea name="notes" rows={3} placeholder="Comportamento observado, ambiente, dados usados…" />
              </Field>
            </>
          ) : (
            <p className="text-sm text-fg-2">O Kiwi monta o bug com os dados do caso e abre o link numa nova aba.</p>
          )}
          <FormFooter
            busy={busy}
            disabled={target.blocked}
            error={error}
            submitLabel={target.destination === "azure" ? "Criar bug no Azure" : "Abrir bug"}
            onCancel={onClose}
          />
        </form>
      )}
    </Dialog>
  );
}
