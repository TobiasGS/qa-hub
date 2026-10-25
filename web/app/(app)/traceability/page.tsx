import { Bug, ChevronRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Filters } from "@/components/filters";
import { StatusBadge } from "@/components/status";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { traceabilityData, type Outcome } from "@/lib/metrics";
import { requirementTemplates, requirementUrl } from "@/lib/requirements";
import { requireKiwi } from "@/lib/session";

const ROW_LABEL: Record<Outcome, string> = { passed: "Coberto", failed: "Com falha", blocked: "Bloqueado", pending: "Não executado" };

export default async function TraceabilityPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { kiwi } = await requireKiwi();
  const sp = await searchParams;
  const { rows, stats } = await traceabilityData(kiwi);
  const visible = rows.filter((r) => !sp.outcome || r.outcome === sp.outcome);
  const templates = requirementTemplates();

  return (
    <>
      <PageHeader title="Rastreabilidade" description="Requisito (história do Jira/Azure) → casos → último resultado → bugs" />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Mini label="Requisitos" value={stats.requirements} />
        <Mini label="Cobertos (tudo passou)" value={stats.covered} />
        <Mini label="Com falha ou bloqueio" value={stats.failing} />
        <Mini label="Casos sem requisito" value={stats.orphanCases} />
      </div>

      <Filters
        filters={[
          {
            name: "outcome",
            label: "Situação",
            options: (["failed", "blocked", "pending", "passed"] as Outcome[]).map((o) => ({ value: o, label: ROW_LABEL[o] })),
          },
        ]}
      />

      <Card>
        {visible.length === 0 ? (
          <EmptyState>Nada com esse filtro.</EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((row) => {
              const url = row.requirement ? requirementUrl(row.requirement, templates) : null;
              const bugCount = new Set(row.cases.flatMap((c) => c.bugs.map((b) => b.url))).size;
              return (
                <li key={row.requirement ?? "_none"}>
                  <details className="group" open={row.outcome === "failed" || row.outcome === "blocked"}>
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3.5 hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                      <ChevronRight className="size-4 shrink-0 text-muted transition group-open:rotate-90" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="text-sm font-semibold">{row.requirement ?? "Sem requisito"}</span>
                        <span className="ml-2 text-xs text-muted">
                          {row.cases.length} {row.cases.length === 1 ? "caso" : "casos"}
                          {bugCount > 0 && ` · ${bugCount} ${bugCount === 1 ? "bug" : "bugs"}`}
                        </span>
                      </span>
                      {url && (
                        <a href={url} target="_blank" rel="noreferrer" className="hidden items-center gap-1 text-xs text-muted hover:text-fg sm:inline-flex">
                          abrir história <ExternalLink className="size-3" />
                        </a>
                      )}
                      <StatusBadge outcome={row.outcome} label={ROW_LABEL[row.outcome]} className="w-32 shrink-0 justify-end" />
                    </summary>
                    <div className="overflow-x-auto pb-2">
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-border">
                          {row.cases.map(({ case: c, outcome, lastExecution, bugs }) => (
                            <tr key={c.id}>
                              <td className="py-2.5 pl-12 pr-3">
                                <span className="text-muted tabular">TC-{c.id}</span> {c.summary}
                                {c.is_automated && <span className="ml-2 text-xs text-muted">automatizado</span>}
                              </td>
                              <td className="px-3 py-2.5">
                                <StatusBadge outcome={outcome} label={lastExecution ? undefined : "Não executado"} />
                              </td>
                              <td className="hidden px-3 py-2.5 text-xs text-muted md:table-cell">
                                {lastExecution && (
                                  <Link href={`/runs/${lastExecution.run}`} className="hover:text-fg hover:underline">
                                    build {lastExecution.build__name} · run #{lastExecution.run}
                                  </Link>
                                )}
                              </td>
                              <td className="px-5 py-2.5">
                                <div className="flex flex-wrap gap-2">
                                  {[...new Map(bugs.map((b) => [b.url, b])).values()].map((b) => (
                                    <a key={b.id} href={b.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium hover:underline">
                                      <Bug className="size-3.5 text-failed" aria-hidden />
                                      {b.name || "bug"}
                                    </a>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted">
        O requisito vem do campo <b>Requirement</b> do caso no Kiwi (ex.: SHOP-101 ou AB#456). &quot;Último resultado&quot; considera a execução mais recente já executada do caso.
      </p>
    </>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-fg-2">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular">{value}</p>
    </Card>
  );
}
