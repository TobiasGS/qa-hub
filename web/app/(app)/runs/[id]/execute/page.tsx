import { notFound } from "next/navigation";
import { ExecuteRunner } from "@/components/execute-runner";
import { requireKiwi } from "@/lib/session";

export default async function ExecutePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ i?: string; e?: string }> }) {
  const { kiwi } = await requireKiwi();
  const id = Number((await params).id);
  const sp = await searchParams;
  const [[run], executions, statuses] = await Promise.all([kiwi.runs({ id }), kiwi.executions({ run: id }), kiwi.statuses()]);
  if (!run) notFound();
  const [cases, links] = executions.length
    ? await Promise.all([kiwi.cases({ id__in: executions.map((e) => e.case) }), kiwi.links({ execution__in: executions.map((e) => e.id) })])
    : [[], []];

  const sorted = [...executions].sort((a, b) => a.sortkey - b.sortkey || a.id - b.id);

  return (
    <ExecuteRunner
      run={run}
      executions={sorted}
      statuses={statuses}
      cases={cases.map((c) => ({ id: c.id, text: c.text ?? "", priority: c.priority__value, requirement: c.requirement }))}
      links={links}
      initialIndex={initialIndex(sorted, sp)}
    />
  );
}

/** ?e=<execução> (link vindo do bug no Azure) ou ?i=<posição na lista>. */
function initialIndex(executions: { id: number }[], sp: { i?: string; e?: string }): number | undefined {
  if (sp.e) {
    const i = executions.findIndex((x) => x.id === Number(sp.e));
    if (i >= 0) return i;
  }
  return sp.i === undefined ? undefined : Number(sp.i);
}
