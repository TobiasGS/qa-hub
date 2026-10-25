import { Play } from "lucide-react";
import Link from "next/link";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { myPendingTests } from "@/lib/my-tests";
import { requireKiwi } from "@/lib/session";

export default async function MyTestsPage() {
  const { kiwi, username } = await requireKiwi();
  const { total, groups } = await myPendingTests(kiwi, username);

  return (
    <>
      <PageHeader
        title="Meus testes"
        description={total ? `${total} ${total === 1 ? "caso pendente" : "casos pendentes"} atribuídos a você em ${groups.length} ${groups.length === 1 ? "run" : "runs"}` : "Casos atribuídos a você"}
      />
      {groups.length === 0 ? (
        <Card>
          <EmptyState>Nada pendente para você. 🎉</EmptyState>
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map(({ run, executions }) => (
            <Card key={run.id}>
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
                <div className="min-w-0">
                  <Link href={`/runs/${run.id}`} className="text-sm font-semibold hover:underline">
                    {run.summary}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted">
                    {run.plan__name} · build {run.build__name} · {executions.length} pendentes
                  </p>
                </div>
                <ButtonLink href={`/runs/${run.id}/execute`} variant="primary">
                  <Play className="size-4" /> Executar
                </ButtonLink>
              </div>
              <ul className="mt-2 divide-y divide-border pb-1">
                {executions.slice(0, 8).map((e) => (
                  <li key={e.id} className="truncate px-5 py-2 text-sm">
                    <span className="text-muted tabular">TC-{e.case}</span> {e.case__summary}
                  </li>
                ))}
                {executions.length > 8 && <li className="px-5 py-2 text-xs text-muted">e mais {executions.length - 8}…</li>}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
