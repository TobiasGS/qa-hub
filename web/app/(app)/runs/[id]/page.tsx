import { Bug, Play } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveRefresh } from "@/components/live-refresh";
import { RetestButton } from "@/components/retest-button";
import { RunDiagnosis } from "@/components/run-diagnosis";
import { SignalBadges } from "@/components/signal-badges";
import { formatRate, OutcomeLegend, ProgressBar, StatusBadge } from "@/components/status";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { failureSignals } from "@/lib/diagnosis";
import { latestJob } from "@/lib/jobs";
import { outcomeOf, summarize } from "@/lib/metrics";
import { aiConfigured, readDiagnosis, type SavedDiagnosis } from "@/lib/run-diagnosis";
import { requireKiwi } from "@/lib/session";
import { parseKiwiDate } from "@/lib/timer";
import { canEditPlan, canSeeRun, visibleSet } from "@/lib/visibility";

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
  const signals = failedCount > 0 ? await failureSignals(kiwi, run, { executions, statuses, links }) : [];
  const signalOf = new Map(signals.map((sg) => [sg.executionId, sg]));
  const job = latestJob<SavedDiagnosis, null>("diagnosis", run.id);
  const caseLinks = Object.fromEntries(sorted.map((e, i) => [e.id, { index: i, title: `TC-${e.case} ${e.case__summary}` }]));

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
          <div className="flex flex-wrap items-center gap-2">
            {!run.stop_date && <LiveRefresh />}
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

      {failedCount > 0 && (
        <RunDiagnosis
          runId={run.id}
          initial={{
            saved: readDiagnosis(run.notes),
            job: job && { status: job.status, elapsed: Math.round(((job.finishedAt ?? Date.now()) - job.startedAt) / 1000), ...(job.error ? { error: job.error } : {}) },
          }}
          cases={caseLinks}
          canAnalyze={!!plan && canEditPlan(viewer, plan) && aiConfigured()}
          configured={aiConfigured()}
        />
      )}

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
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge outcome={outcomeOf(e.status, statuses)} />
                          {signalOf.has(e.id) && <SignalBadges tags={signalOf.get(e.id)!.tags} lastPassBuild={signalOf.get(e.id)!.lastPassBuild} />}
                        </div>
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
