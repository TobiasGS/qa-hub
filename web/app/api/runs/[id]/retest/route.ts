import { ApiError, apiRoute, currentUser, readJson, toId } from "@/lib/api";
import { markRunStarted } from "@/lib/run-state";
import { requireRunVisible } from "@/lib/visibility";
import { outcomeOf } from "@/lib/metrics";

/** Cria um run novo só com os casos que falharam ou ficaram bloqueados. Corpo: { build } */
export const POST = apiRoute<{ id: string }>(async (ctx, req, { id }) => {
  const { kiwi } = ctx;
  const raw = await readJson(req);
  const sourceId = toId(id);
  await requireRunVisible(kiwi, ctx.viewer, sourceId);
  const [[source], executions, statuses] = await Promise.all([kiwi.runs({ id: sourceId }), kiwi.executions({ run: sourceId }), kiwi.statuses()]);
  if (!source) throw new ApiError("Run não encontrado", 404);

  const failed = executions.filter((e) => ["failed", "blocked"].includes(outcomeOf(e.status, statuses)));
  if (!failed.length) throw new ApiError("Este run não tem falhas nem bloqueios para re-testar");

  const me = await currentUser(ctx);
  const [tester] = source.default_tester__username ? await kiwi.users({ username: source.default_tester__username }) : [];
  const run = await kiwi.createRun({
    plan: source.plan,
    build: raw.build ? toId(raw.build, "build") : source.build,
    summary: `Re-teste: ${source.summary}`,
    manager: me.id,
    default_tester: tester?.id ?? null,
  });
  // Mantém o mesmo responsável de cada caso no run de origem.
  for (const e of failed.sort((a, b) => a.sortkey - b.sortkey)) {
    const created = await kiwi.addCaseToRun(run.id, e.case);
    if (e.assignee && created.assignee !== e.assignee) await kiwi.updateExecution(created.id, { assignee: e.assignee });
  }
  await markRunStarted(kiwi, source.plan); // tarefa do plano no Azure → "Em Teste"
  return { run, cases: failed.length };
});
