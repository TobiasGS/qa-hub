import Link from "next/link";
import { Filters } from "@/components/filters";
import { formatRate, ProgressBar } from "@/components/status";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import type { Query } from "@/lib/kiwi/types";
import { summarize } from "@/lib/metrics";
import { requireKiwi } from "@/lib/session";
import { canSeePlan, canSeeProject, canSeeRun, visibleSet } from "@/lib/visibility";
import { parseKiwiDate } from "@/lib/timer";

export default async function RunsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { kiwi, viewer } = await requireKiwi();
  const visible = await visibleSet(kiwi, viewer);
  const sp = await searchParams;

  const query: Query = {};
  if (sp.plan) query.plan = Number(sp.plan);
  if (sp.build) query.build = Number(sp.build);

  const [allRuns, allPlans, allBuilds, statuses, projects] = await Promise.all([kiwi.runs(query), kiwi.plans(), kiwi.builds(), kiwi.statuses(), kiwi.products()]);
  // Filtro por projeto: vale para os runs e também para as opções de plano e build.
  const project = sp.project ? Number(sp.project) : null;
  const plans = allPlans.filter((p) => (!project || p.product === project) && canSeePlan(visible, p.id));
  const planIds = new Set(plans.map((p) => p.id));
  const versions = new Set(plans.map((p) => p.product_version));
  const builds = allBuilds.filter((b) => !project || versions.has(b.version));
  const runs = allRuns
    .filter((r) => planIds.has(r.plan) && canSeeRun(visible, r.id))
    .filter((r) => (sp.state === "open" ? !r.stop_date : sp.state === "closed" ? !!r.stop_date : true))
    .sort((a, b) => (b.start_date ?? "").localeCompare(a.start_date ?? "") || b.id - a.id)
    .slice(0, 100);
  const executions = runs.length ? await kiwi.executions({ run__in: runs.map((r) => r.id) }) : [];

  return (
    <>
      <PageHeader title="Runs" description="Execuções manuais e automáticas (Cypress)" />
      <Filters
        filters={[
          { name: "project", label: "Projeto", options: projects.filter((p) => canSeeProject(visible, p.id)).map((p) => ({ value: String(p.id), label: p.name })) },
          { name: "plan", label: "Plano", options: plans.map((p) => ({ value: String(p.id), label: p.name })) },
          { name: "build", label: "Build", options: builds.map((b) => ({ value: String(b.id), label: b.name })) },
          {
            name: "state",
            label: "Situação",
            options: [
              { value: "open", label: "Em andamento" },
              { value: "closed", label: "Concluídos" },
            ],
          },
        ]}
      />
      <Card>
        {runs.length === 0 ? (
          <EmptyState>Nenhum run com esses filtros.</EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {runs.map((run) => {
              const s = summarize(executions.filter((e) => e.run === run.id), statuses);
              return (
                <li key={run.id}>
                  <Link href={`/runs/${run.id}`} className="grid gap-2 px-5 py-3.5 hover:bg-surface-2 md:grid-cols-[1fr_220px_90px] md:items-center md:gap-6">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{run.summary}</span>
                        {!run.stop_date && <Badge className="bg-accent/15 text-accent">em andamento</Badge>}
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        #{run.id} · {run.plan__name} · build {run.build__name} · {run.default_tester__username ?? run.manager__username}
                        {run.start_date && ` · ${new Date(parseKiwiDate(run.start_date)).toLocaleDateString("pt-BR")}`}
                      </p>
                    </div>
                    <ProgressBar summary={s} />
                    <span className="text-xs text-fg-2 tabular md:text-right">
                      {s.executed}/{s.total} · {formatRate(s.passRate)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
