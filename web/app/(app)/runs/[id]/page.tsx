import { Bug, Play } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RetestButton } from "@/components/retest-button";
import { formatRate, OutcomeLegend, ProgressBar, StatusBadge } from "@/components/status";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { outcomeOf, summarize } from "@/lib/metrics";
import { requireKiwi } from "@/lib/session";
import { parseKiwiDate } from "@/lib/timer";
import { canSeeRun, visibleSet } from "@/lib/visibility";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { kiwi, viewer } = await requireKiwi();
  const id = Number((await params).id);
  const [[run], executions, statuses] = await Promise.all([kiwi.runs({ id }), kiwi.executions({ run: id }), kiwi.statuses()]);
  if (!run || !canSeeRun(await visibleSet(kiwi, viewer), run.id)) notFound();
  const [links, [plan]] = await Promise.all([executions.length ? kiwi.links({ execution__in: executions.map((e) => e.id) }) : [], kiwi.plans({ id: run.plan })]);
  const builds = plan ? await kiwi.builds({ version: plan.product_version }) : [];
  const s = summarize(executions, statuses);
  const sorted = [...executions].sort((a, b) => a.sortkey - b.sortkey || a.id - b.id);
  const failedCount = s.failed + s.blocked;
  // Cada bug criado ou vinculado numa execução é um link "defeito" no Kiwi.
  const bugs = links.filter((l) => l.is_defect);

  return (
    <>
      <PageHeader
        title={run.summary}
        description={`#${run.id} · ${run.plan__name} · build ${run.build__name} · ${
          run.stop_date
            ? `concluído em ${new Date(parseKiwiDate(run.stop_date)).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
            : "em andamento"
        }`}
        action={
          <div className="flex flex-wrap gap-2">
            {failedCount > 0 && <RetestButton run={run} failedCount={failedCount} builds={builds} />}
            <ButtonLink href={`/runs/${run.id}/execute`} variant="primary">
              <Play className="size-4" /> Executar
            </ButtonLink>
          </div>
        }
      />

      <Card className="mb-3 p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-sm text-fg-2">
            <span className="text-2xl font-semibold text-fg">{formatRate(s.passRate)}</span> de sucesso · {s.executed} de {s.total} executados
            {bugs.length > 0 && ` · ${bugs.length} bug${bugs.length === 1 ? "" : "s"}`}
          </p>
          <OutcomeLegend />
        </div>
        <ProgressBar summary={s} className="h-3" />
      </Card>

      <Card>
        {sorted.length === 0 ? (
          <EmptyState>Este run não tem casos.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="px-5 py-3 font-medium">Caso</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="hidden px-3 py-3 font-medium md:table-cell">Responsável</th>
                  <th className="px-5 py-3 font-medium">Bugs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sorted.map((e, i) => {
                  const caseBugs = bugs.filter((l) => l.execution === e.id);
                  return (
                    <tr key={e.id}>
                      <td className="px-5 py-3">
                        <Link href={`/runs/${run.id}/execute?i=${i}`} className="hover:underline">
                          <span className="text-muted tabular">TC-{e.case}</span> {e.case__summary}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge outcome={outcomeOf(e.status, statuses)} />
                      </td>
                      <td className="hidden px-3 py-3 text-fg-2 md:table-cell">{e.tested_by__username ?? e.assignee__username ?? "—"}</td>
                      <td className="px-5 py-3">
                        {caseBugs.length === 0 ? (
                          <span className="text-muted">—</span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="inline-flex items-center gap-1 font-medium tabular" title={`${caseBugs.length} bug(s) aberto(s) neste caso`}>
                              <Bug className="size-3.5 text-failed" aria-hidden /> {caseBugs.length}
                            </span>
                            {caseBugs.map((l) => (
                              <a key={l.id} href={l.url} target="_blank" rel="noreferrer" className="text-xs text-fg-2 hover:underline">
                                {l.name || "bug"}
                              </a>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
