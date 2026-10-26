"use client";

import { Ban, Bot, Copy, Loader2, MoreHorizontal, Pencil, Plus, RotateCcw, Unlink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { TestCase } from "@/lib/kiwi/types";
import { send } from "@/lib/client-api";
import type { Outcome } from "@/lib/metrics";
import type { RequirementTemplates } from "@/lib/requirements";
import { CaseForm, caseStatusLabel, type CaseOptions } from "./case-form";
import { ConfirmDialog, Dialog } from "./dialog";
import { GenerateCasesButton } from "./generate-cases-dialog";
import { RequirementChips } from "./requirement-chips";
import { StatusBadge } from "./status";
import { Badge, Button, cn, EmptyState } from "./ui";

type Action =
  | { kind: "new" }
  | { kind: "edit"; testCase: TestCase; clonedFrom?: TestCase }
  | { kind: "remove" | "toggle"; testCase: TestCase }
  | null;

const cloneTitle = (summary: string) => `${summary} (cópia)`.slice(0, 255);

export function CaseTable({
  planId,
  cases,
  lastOutcome,
  options,
  templates,
  readOnly = false,
  storyCard = null,
}: {
  planId: number;
  cases: TestCase[];
  /** Último resultado de cada caso neste plano, por id do caso. */
  lastOutcome: Record<number, Outcome>;
  options: CaseOptions;
  templates: RequirementTemplates;
  /** Plano de outra pessoa (visível por atribuição): só leitura, sem criar/editar/clonar/remover. */
  readOnly?: boolean;
  /** Card do Azure do plano (azure-N): mostra "Gerar casos da história". */
  storyCard?: string | null;
}) {
  const router = useRouter();
  const [action, setAction] = useState<Action>(null);
  const close = () => setAction(null);
  const disabledId = options.statuses.find((s) => s.name === "DISABLED")?.id;
  const confirmedId = options.statuses.find((s) => s.name === "CONFIRMED")?.id;
  const [cloning, setCloning] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Cria a cópia no plano na hora e já abre a cópia em edição (título, passos…). */
  async function cloneCase(c: TestCase) {
    setCloning(c.id);
    setError(null);
    try {
      const { case: created } = await send<{ case: TestCase }>(`/api/plans/${planId}/cases`, "POST", {
        summary: cloneTitle(c.summary),
        text: c.text ?? "",
        requirement: c.requirement ?? "",
        priority: c.priority,
        category: c.category,
        // A cópia de um caso desativado nasce ativa: quem clona quer usar.
        case_status: c.case_status__name === "DISABLED" ? (confirmedId ?? c.case_status) : c.case_status,
        is_automated: c.is_automated,
      });
      router.refresh();
      setAction({ kind: "edit", testCase: created, clonedFrom: c });
    } catch (e) {
      setError(`Não foi possível clonar: ${(e as Error).message}`);
    } finally {
      setCloning(null);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <div>
          <h2 className="text-sm font-semibold">Casos de teste</h2>
          <p className="mt-0.5 text-xs text-muted">{cases.length} neste plano</p>
        </div>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            {storyCard && <GenerateCasesButton planId={planId} cardKey={storyCard} options={options} />}
            <Button variant="primary" onClick={() => setAction({ kind: "new" })}>
              <Plus className="size-4" /> Novo caso
            </Button>
          </div>
        )}
      </div>

      {error && <p className="mx-5 mt-3 rounded-lg bg-failed/10 px-3 py-2 text-sm text-failed">{error}</p>}

      {cases.length === 0 ? (
        <EmptyState>Nenhum caso ainda. Crie o primeiro para poder montar um run.</EmptyState>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {cases.map((c) => {
            const disabled = c.case_status__name === "DISABLED";
            return (
              <li key={c.id} className={cn("flex items-start gap-3 px-5 py-3", disabled && "opacity-60")}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-xs text-muted tabular">TC-{c.id}</span>
                    <span className="text-sm font-medium">{c.summary}</span>
                    {c.is_automated && <Bot className="size-3.5 text-muted" aria-label="Automatizado" />}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge>{c.priority__value}</Badge>
                    {c.case_status__name !== "CONFIRMED" && <Badge>{caseStatusLabel(c.case_status__name)}</Badge>}
                    <RequirementChips value={c.requirement} templates={templates} />
                  </div>
                </div>
                <StatusBadge outcome={lastOutcome[c.id] ?? "pending"} label={lastOutcome[c.id] ? undefined : "Nunca executado"} className="mt-0.5 hidden w-36 shrink-0 sm:inline-flex" />
                {cloning === c.id && <Loader2 className="mt-1.5 size-4 shrink-0 animate-spin text-muted" aria-label="Clonando" />}
                {!readOnly && (
                  <RowMenu
                    items={[
                      { label: "Editar", icon: Pencil, onClick: () => setAction({ kind: "edit", testCase: c }) },
                      { label: "Clonar caso", icon: Copy, onClick: () => cloneCase(c) },
                      { label: disabled ? "Reativar" : "Desativar", icon: disabled ? RotateCcw : Ban, onClick: () => setAction({ kind: "toggle", testCase: c }) },
                      { label: "Remover do plano", icon: Unlink, onClick: () => setAction({ kind: "remove", testCase: c }), danger: true },
                    ]}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={action?.kind === "new" || action?.kind === "edit"}
        onClose={close}
        title={action?.kind === "edit" ? (action.clonedFrom ? "Editar caso clonado" : "Editar caso") : "Novo caso de teste"}
        description={
          action?.kind === "edit" && action.clonedFrom
            ? `TC-${action.testCase.id} foi criado como cópia de TC-${action.clonedFrom.id}. Ajuste o título ou os passos e salve.`
            : undefined
        }
        wide
      >
        <CaseForm
          key={action?.kind === "edit" ? action.testCase.id : "new"}
          planId={planId}
          testCase={action?.kind === "edit" ? action.testCase : undefined}
          options={options}
          templates={templates}
          onDone={close}
        />
      </Dialog>

      {action?.kind === "remove" && (
        <ConfirmDialog
          open
          onClose={close}
          title="Remover do plano?"
          confirmLabel="Remover"
          danger
          message={
            <p>
              <b>{action.testCase.summary}</b> deixa de fazer parte deste plano. O caso e o histórico de execuções continuam no Kiwi, e ele segue em outros planos.
            </p>
          }
          onConfirm={async () => {
            await send(`/api/plans/${planId}/cases/${action.testCase.id}`, "DELETE");
            router.refresh();
          }}
        />
      )}
      {action?.kind === "toggle" && (
        <ConfirmDialog
          open
          onClose={close}
          title={action.testCase.case_status__name === "DISABLED" ? "Reativar caso?" : "Desativar caso?"}
          confirmLabel={action.testCase.case_status__name === "DISABLED" ? "Reativar" : "Desativar"}
          message={
            action.testCase.case_status__name === "DISABLED" ? (
              <p>O caso volta a ser Confirmado e entra de novo nos novos runs e na rastreabilidade.</p>
            ) : (
              <p>Casos desativados ficam fora dos novos runs e da rastreabilidade, mas o histórico é mantido.</p>
            )
          }
          onConfirm={async () => {
            const status = action.testCase.case_status__name === "DISABLED" ? confirmedId : disabledId;
            await send(`/api/cases/${action.testCase.id}`, "PATCH", { case_status: status });
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function RowMenu({ items }: { items: { label: string; icon: typeof Pencil; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Ações" aria-expanded={open}>
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg">
          {items.map((it) => (
            <button
              key={it.label}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2", it.danger && "text-failed")}
            >
              <it.icon className="size-4" /> {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
