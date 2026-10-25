"use client";

import { Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { TestPlan } from "@/lib/kiwi/types";
import { send } from "@/lib/client-api";
import type { RequirementTemplates } from "@/lib/requirements";
import { ConfirmDialog, Dialog } from "./dialog";
import { PlanForm, type PlanOptions } from "./plan-form";
import { Button } from "./ui";

export function NewPlanButton({ options, templates }: { options: PlanOptions; templates: RequirementTemplates }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Novo plano
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Novo plano de teste" wide>
        <PlanForm options={options} templates={templates} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

export function PlanToolbar({ plan, options, templates }: { plan: TestPlan; options: PlanOptions; templates: RequirementTemplates }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);

  return (
    <>
      <Button onClick={() => setEditing(true)}>
        <Pencil className="size-4" /> Editar
      </Button>
      <Button onClick={() => setArchiving(true)}>
        {plan.is_active ? <Archive className="size-4" /> : <ArchiveRestore className="size-4" />}
        {plan.is_active ? "Arquivar" : "Restaurar"}
      </Button>

      <Dialog open={editing} onClose={() => setEditing(false)} title="Editar plano" wide>
        <PlanForm plan={plan} options={options} templates={templates} onDone={() => setEditing(false)} />
      </Dialog>
      <ConfirmDialog
        open={archiving}
        onClose={() => setArchiving(false)}
        title={plan.is_active ? "Arquivar plano?" : "Restaurar plano?"}
        confirmLabel={plan.is_active ? "Arquivar" : "Restaurar"}
        message={
          plan.is_active ? (
            <>
              <p>
                <b>{plan.name}</b> sai da lista de planos ativos. Casos, runs e o histórico de execuções continuam guardados, e dá para restaurar quando quiser.
              </p>
              <p className="mt-2 text-xs text-muted">A exclusão definitiva só pode ser feita pelo admin do Kiwi.</p>
            </>
          ) : (
            <p>
              <b>{plan.name}</b> volta para a lista de planos ativos.
            </p>
          )
        }
        onConfirm={async () => {
          await send(`/api/plans/${plan.id}`, "PATCH", { is_active: !plan.is_active });
          router.refresh();
        }}
      />
    </>
  );
}
