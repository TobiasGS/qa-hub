import { ArrowLeft, ExternalLink, Play } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CaseTable } from "@/components/case-table";
import { PlanToolbar } from "@/components/plan-actions";
import { RequirementChips } from "@/components/requirement-chips";
import { formatRate, ProgressBar } from "@/components/status";
import { Badge, ButtonLink, Card, CardHeader, EmptyState } from "@/components/ui";
import type { TestExecution } from "@/lib/kiwi/types";
import { outcomeOf, summarize, type Outcome } from "@/lib/metrics";
import { caseOptions, planOptions } from "@/lib/options";
import { parseRequirements, requirementTemplates } from "@/lib/requirements";
import { requireKiwi } from "@/lib/session";
import { canEditPlan, canSeePlan, visibleSet } from "@/lib/visibility";

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { kiwi, viewer } = await requireKiwi();
  const id = Number((await params).id);
  const [[plan], cases, runs, statuses] = await Promise.all([kiwi.plans({ id }), kiwi.cases({ plan: id }), kiwi.runs({ plan: id }), kiwi.statuses()]);
  const visible = await visibleSet(kiwi, viewer);
  if (!plan || !canSeePlan(visible, plan.id)) notFound();
  const editable = canEditPlan(viewer, plan);
  const [pOptions, cOptions] = await Promise.all([planOptions(kiwi, visible), caseOptions(kiwi, plan.product)]);
  const executions = runs.length ? await kiwi.executions({ run__in: runs.map((r) => r.id) }) : [];
  const templates = requirementTemplates();

  // Último resultado executado de cada caso dentro deste plano.
  const last = new Map<number, TestExecution>();
  for (const e of executions) {
    if (outcomeOf(e.status, statuses) === "pending") continue;
    const cur = last.get(e.case);
    if (!cur || e.id > cur.id) last.set(e.case, e);
  }
  const lastOutcome: Record<number, Outcome> = Object.fromEntries([...last].map(([caseId, e]) => [caseId, outcomeOf(e.status, statuses)]));

  const sortedRuns = [...runs].sort((a, b) => (b.start_date ?? "").localeCompare(a.start_date ?? "") || b.id - a.id);
  const sortedCases = [...cases].sort((a, b) => Number(a.case_status__name === "DISABLED") - Number(b.case_status__name === "DISABLED") || a.id - b.id);
  const activeCases = cases.filter((c) => c.case_status__name !== "DISABLED").length;

  return (
    <>
      <Link href="/plans" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
        <ArrowLeft className="size-3.5" /> Planos
      </Link>
      <div className="mb-6 mt-1 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{plan.name}</h1>
            <Badge>{plan.type__name}</Badge>
            {!plan.is_active && <Badge className="bg-blocked/20">arquivado</Badge>}
            {!editable && <Badge className="bg-accent/15 text-accent">Compartilhado comigo · só leitura</Badge>}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-fg-2">
            Projeto: {plan.product__name} · por {plan.author__username}
            {plan.extra_link &&
              (parseRequirements(plan.extra_link).keys.length === 0 ? (
                <a href={plan.extra_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                  card <ExternalLink className="size-3" />
                </a>
              ) : (
                <RequirementChips value={plan.extra_link} templates={templates} />
              ))}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable && <PlanToolbar plan={plan} options={pOptions} templates={templates} />}
          {editable && plan.is_active && activeCases > 0 && (
            <ButtonLink href={`/plans/${plan.id}/runs/new`} variant="primary">
              <Play className="size-4" /> Novo run
            </ButtonLink>
          )}
        </div>
      </div>

      {plan.text?.trim() && (
        <Card className="mb-3 whitespace-pre-wrap p-5 text-sm leading-relaxed text-fg-2">{plan.text}</Card>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="pb-2 lg:col-span-2">
          <CaseTable planId={plan.id} cases={sortedCases} lastOutcome={lastOutcome} options={cOptions} templates={templates} readOnly={!editable} />
        </Card>

        <Card>
          <CardHeader title="Runs deste plano" description={`${runs.length} no total`} />
          {sortedRuns.length === 0 ? (
            <EmptyState>Nenhum run ainda.</EmptyState>
          ) : (
            <ul className="divide-y divide-border px-5 pb-2 pt-2">
              {sortedRuns.slice(0, 10).map((run) => {
                const s = summarize(executions.filter((e) => e.run === run.id), statuses);
                return (
                  <li key={run.id}>
                    <Link href={`/runs/${run.id}`} className="-mx-2 block rounded-lg px-2 py-2.5 hover:bg-surface-2">
                      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate">{run.summary}</span>
                        <span className="shrink-0 text-xs text-fg-2 tabular">{formatRate(s.passRate)}</span>
                      </div>
                      <ProgressBar summary={s} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {runs.length > 10 && (
            <Link href={`/runs?plan=${plan.id}`} className="block px-5 pb-4 text-xs text-accent hover:underline">
              Ver todos os runs
            </Link>
          )}
        </Card>
      </div>
    </>
  );
}
