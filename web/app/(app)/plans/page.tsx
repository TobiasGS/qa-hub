import { FolderKanban } from "lucide-react";
import Link from "next/link";
import { Filters } from "@/components/filters";
import { NewPlanButton } from "@/components/plan-actions";
import { RequirementChips } from "@/components/requirement-chips";
import { formatRate, ProgressBar } from "@/components/status";
import { Badge, ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import type { TestPlan, TestRun } from "@/lib/kiwi/types";
import { summarize } from "@/lib/metrics";
import { planOptions } from "@/lib/options";
import { parseRequirements, requirementTemplates } from "@/lib/requirements";
import { requireKiwi } from "@/lib/session";

export default async function PlansPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { kiwi } = await requireKiwi();
  const sp = await searchParams;
  const archived = sp.archived === "1";
  const project = sp.project ? Number(sp.project) : null;
  const [allPlans, runs, statuses, options] = await Promise.all([kiwi.plans({ is_active: !archived }), kiwi.runs(), kiwi.statuses(), planOptions(kiwi)]);
  const plans = allPlans.filter((p) => !project || p.product === project);
  const templates = requirementTemplates();

  // Último run de cada plano, para mostrar o estado atual.
  const lastRun = new Map<number, TestRun>();
  for (const r of runs) {
    const cur = lastRun.get(r.plan);
    if (!cur || (r.start_date ?? "") > (cur.start_date ?? "")) lastRun.set(r.plan, r);
  }
  const lastIds = plans.map((p) => lastRun.get(p.id)?.id).filter((id): id is number => !!id);
  const executions = lastIds.length ? await kiwi.executions({ run__in: lastIds }) : [];

  // Uma seção por projeto, em ordem alfabética.
  const sections = options.projects
    .map((proj) => ({ project: proj, plans: plans.filter((p) => p.product === proj.id).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")) }))
    .filter((s) => s.plans.length > 0);

  return (
    <>
      <PageHeader
        title={archived ? "Planos arquivados" : "Planos de teste"}
        description={`${plans.length} ${archived ? "arquivados" : "ativos"} em ${sections.length} ${sections.length === 1 ? "projeto" : "projetos"}`}
        action={
          <div className="flex gap-2">
            <ButtonLink href={archived ? "/plans" : "/plans?archived=1"}>{archived ? "Ver ativos" : "Mostrar arquivados"}</ButtonLink>
            {!archived && <NewPlanButton options={options} templates={templates} />}
          </div>
        }
      />
      <Filters filters={[{ name: "project", label: "Projeto", options: options.projects.map((p) => ({ value: String(p.id), label: p.name })) }]} />

      {sections.length === 0 ? (
        <Card>
          <EmptyState>{archived ? "Nenhum plano arquivado." : "Nenhum plano ativo aqui. Crie o primeiro em \"Novo plano\"."}</EmptyState>
        </Card>
      ) : (
        <div className="space-y-8">
          {sections.map(({ project: proj, plans: sectionPlans }) => {
            const sectionRuns = sectionPlans.map((p) => lastRun.get(p.id)).filter((r): r is TestRun => !!r);
            const sectionSummary = summarize(executions.filter((e) => sectionRuns.some((r) => r.id === e.run)), statuses);
            return (
              <section key={proj.id} aria-labelledby={`project-${proj.id}`}>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
                  <h2 id={`project-${proj.id}`} className="flex items-center gap-2 text-base font-semibold">
                    <FolderKanban className="size-4 text-accent" aria-hidden />
                    {proj.name}
                  </h2>
                  <span className="text-xs text-muted tabular">
                    {sectionPlans.length} {sectionPlans.length === 1 ? "plano" : "planos"} · último ciclo {formatRate(sectionSummary.passRate)}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {sectionPlans.map((plan) => (
                    <PlanCard key={plan.id} plan={plan} run={lastRun.get(plan.id)} runs={runs} executions={executions} statuses={statuses} templates={templates} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function PlanCard({
  plan,
  run,
  runs,
  executions,
  statuses,
  templates,
}: {
  plan: TestPlan;
  run?: TestRun;
  runs: TestRun[];
  executions: Awaited<ReturnType<Awaited<ReturnType<typeof requireKiwi>>["kiwi"]["executions"]>>;
  statuses: Parameters<typeof summarize>[1];
  templates: ReturnType<typeof requirementTemplates>;
}) {
  const summary = run ? summarize(executions.filter((e) => e.run === run.id), statuses) : null;
  const planRuns = runs.filter((r) => r.plan === plan.id).length;
  return (
    <Card className="relative h-full p-5 transition hover:border-accent/50">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">
          {/* O link cobre o card inteiro; os chips ficam clicáveis por cima. */}
          <Link href={`/plans/${plan.id}`} className="after:absolute after:inset-0">
            {plan.name}
          </Link>
        </h3>
        <Badge>{plan.type__name}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted">
        {planRuns} runs · por {plan.author__username}
      </p>
      {plan.extra_link && parseRequirements(plan.extra_link).keys.length > 0 && (
        <RequirementChips value={plan.extra_link} templates={templates} className="relative z-10 mt-2" />
      )}
      {run && summary ? (
        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-xs text-fg-2">
            <span className="truncate">Último: {run.build__name}</span>
            <span className="tabular">{formatRate(summary.passRate)}</span>
          </div>
          <ProgressBar summary={summary} />
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted">Ainda sem runs.</p>
      )}
    </Card>
  );
}
