import { ArrowRight, Bug, ExternalLink, FolderKanban, UserCheck } from "lucide-react";
import Link from "next/link";
import { Filters } from "@/components/filters";
import { formatRate, OutcomeLegend, ProgressBar } from "@/components/status";
import { TrendChart } from "@/components/trend-chart";
import { Card, CardHeader, cn, EmptyState, PageHeader } from "@/components/ui";
import { dashboardData } from "@/lib/metrics";
import { myPendingTests } from "@/lib/my-tests";
import { requireKiwi } from "@/lib/session";
import { visibleSet } from "@/lib/visibility";
import { formatDuration } from "@/lib/timer";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { kiwi, username, viewer } = await requireKiwi();
  const sp = await searchParams;
  const project = sp.project ? Number(sp.project) : null;
  const visible = await visibleSet(kiwi, viewer);
  const [d, mine] = await Promise.all([dashboardData(kiwi, { project, visible }), myPendingTests(kiwi, username)]);
  const delta = d.latest.passRate !== null && d.previous?.passRate != null ? d.latest.passRate - d.previous.passRate : null;
  const projectName = d.projects.find((p) => p.id === project)?.name;
  const buildHint = project ? (d.latestBuilds[0] ? `build ${d.latestBuilds[0]}` : undefined) : "builds atuais";

  return (
    <>
      <PageHeader
        title={projectName ? `Dashboard · ${projectName}` : "Dashboard"}
        description={
          !d.latestBuilds.length
            ? "Nenhum run encontrado ainda"
            : project
              ? `Build atual: ${d.latestBuilds[0]}`
              : `Todos os projetos · última build de cada um`
        }
      />
      <Filters filters={[{ name: "project", label: "Projeto", options: d.projects.map((p) => ({ value: String(p.id), label: p.name })) }]} />

      {mine.total > 0 && (
        <Link href="/my" className="mb-3 flex items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm hover:bg-accent/15">
          <UserCheck className="size-5 shrink-0 text-accent" aria-hidden />
          <span className="flex-1">
            Você tem <b className="tabular">{mine.total}</b> {mine.total === 1 ? "caso pendente" : "casos pendentes"} em {mine.groups.length}{" "}
            {mine.groups.length === 1 ? "run" : "runs"}.
          </span>
          <span className="flex items-center gap-1 font-medium text-accent">
            Meus testes <ArrowRight className="size-4" />
          </span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Taxa de sucesso" value={formatRate(d.latest.passRate)} hint={buildHint}>
          {delta !== null && (
            <span className={cn("text-xs font-medium tabular", delta >= 0 ? "text-passed-text" : "text-failed")}>
              {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p. vs anterior
            </span>
          )}
        </Stat>
        <Stat label="Executados" value={`${d.latest.executed}/${d.latest.total}`} hint={project ? "casos na build atual" : "casos nas builds atuais"} />
        <Stat label="Tempo médio por caso" value={d.avgSeconds === null ? "—" : formatDuration(d.avgSeconds)} hint="execuções manuais" />
        <Stat label="Runs abertos" value={String(d.openRuns)} hint="sem data de término" />
        <Stat label="Bugs vinculados" value={String(d.defectCount)} hint={`nas últimas builds`} />
      </div>

      {d.byProject.length > 0 && (
        <Card className="mt-3">
          <CardHeader title="Por projeto" description="Situação na última build de cada projeto" />
          <div className="overflow-x-auto pb-2">
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="px-5 py-2 font-medium">Projeto</th>
                  <th className="px-3 py-2 font-medium">Build</th>
                  <th className="hidden px-3 py-2 font-medium sm:table-cell">Planos</th>
                  <th className="px-3 py-2 font-medium">Sucesso</th>
                  <th className="hidden w-48 px-3 py-2 font-medium md:table-cell">Progresso</th>
                  <th className="px-3 py-2 font-medium">Pendentes</th>
                  <th className="hidden px-3 py-2 font-medium sm:table-cell">Bugs</th>
                  <th className="px-5 py-2 font-medium">Tempo médio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border tabular">
                {d.byProject.map((row) => (
                  <tr key={row.project.id}>
                    <td className="px-5 py-2.5">
                      <Link href={`/?project=${row.project.id}`} className="inline-flex items-center gap-2 font-medium hover:underline">
                        <FolderKanban className="size-4 text-accent" aria-hidden /> {row.project.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-fg-2">{row.build ?? "—"}</td>
                    <td className="hidden px-3 py-2.5 text-fg-2 sm:table-cell">{row.activePlans}</td>
                    <td className="px-3 py-2.5">{formatRate(row.summary.passRate)}</td>
                    <td className="hidden px-3 py-2.5 md:table-cell">
                      <ProgressBar summary={row.summary} />
                    </td>
                    <td className="px-3 py-2.5 text-fg-2">{row.summary.pending}</td>
                    <td className="hidden px-3 py-2.5 text-fg-2 sm:table-cell">{row.bugs}</td>
                    <td className="px-5 py-2.5 text-fg-2">{row.avgSeconds === null ? "—" : formatDuration(row.avgSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={project ? "Taxa de sucesso por build" : "Taxa de sucesso por semana"}
            description={project ? "% de execuções que passaram, entre as executadas" : "Todos os projetos juntos; filtre um projeto para ver por build"}
          />
          <div className="px-2 pb-3 pt-2">{d.trend.length ? <TrendChart data={d.trend} /> : <EmptyState>Sem dados.</EmptyState>}</div>
        </Card>

        <Card>
          <CardHeader title="Casos que mais falham" description="Falhas e bloqueios nas últimas builds" />
          {d.topFailures.length ? (
            <ol className="divide-y divide-border px-5 pb-2 pt-2">
              {d.topFailures.map((f) => (
                <li key={f.caseId} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm" title={f.summary}>
                    {f.summary}
                  </span>
                  <span className="shrink-0 text-xs text-fg-2 tabular">
                    {f.failed}/{f.total}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState>Nenhuma falha no período.</EmptyState>
          )}
        </Card>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Progresso dos runs recentes" action={<OutcomeLegend />} />
          {d.runProgress.length ? (
            <ul className="divide-y divide-border px-5 pb-2 pt-2">
              {d.runProgress.map(({ run, summary }) => (
                <li key={run.id}>
                  <Link href={`/runs/${run.id}`} className="-mx-2 block rounded-lg px-2 py-3 hover:bg-surface-2">
                    <div className="mb-2 flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm font-medium">{run.summary}</span>
                      <span className="shrink-0 text-xs text-fg-2 tabular">
                        {summary.executed}/{summary.total} · {formatRate(summary.passRate)}
                      </span>
                    </div>
                    <ProgressBar summary={summary} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>Nenhum run ainda.</EmptyState>
          )}
        </Card>

        <Card>
          <CardHeader title="Bugs recentes" description="Links de defeito nas execuções" />
          {d.recentDefects.length ? (
            <ul className="divide-y divide-border px-5 pb-2 pt-2">
              {d.recentDefects.map(({ link, execution }) => (
                <li key={link.id} className="py-2.5">
                  <a href={link.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm font-medium hover:underline">
                    <Bug className="size-4 text-failed" aria-hidden />
                    {link.name || link.url}
                    <ExternalLink className="size-3 text-muted" aria-hidden />
                  </a>
                  {execution && <p className="mt-0.5 truncate pl-6 text-xs text-muted">{execution.case__summary}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>Nenhum bug vinculado.</EmptyState>
          )}
        </Card>
      </div>
    </>
  );
}

function Stat({ label, value, hint, children }: { label: string; value: string; hint?: string; children?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-fg-2">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
        {hint && <span>{hint}</span>}
        {children}
      </div>
    </Card>
  );
}
