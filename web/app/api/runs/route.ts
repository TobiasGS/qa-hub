import { ApiError, apiRoute, currentUser, readJson, toId, toText } from "@/lib/api";
import { markRunStarted } from "@/lib/run-state";
import { requirePlanEditable } from "@/lib/visibility";

/**
 * Cria um run a partir de um plano.
 * Corpo: { plan, build | newBuild, summary, default_tester, cases: [{ id, assignee }] }
 */
export const POST = apiRoute(async (ctx, req) => {
  const { kiwi } = ctx;
  const raw = await readJson(req);
  const planId = toId(raw.plan, "plano");
  const summary = toText(raw.summary, "título", { required: true });
  const defaultTester = raw.default_tester ? toId(raw.default_tester, "testador") : null;
  const cases = Array.isArray(raw.cases) ? raw.cases.map((c: { id?: unknown; assignee?: unknown }) => ({ id: toId(c.id, "caso"), assignee: c.assignee ? toId(c.assignee, "responsável") : null })) : [];
  if (!cases.length) throw new ApiError("Selecione pelo menos um caso");

  // Só o dono do plano (ou admin) cria runs nele; 404 se nem enxerga o plano.
  const plan = await requirePlanEditable(kiwi, ctx.viewer, planId);

  const newBuild = toText(raw.newBuild, "nova build");
  const build = newBuild ? (await kiwi.createBuild({ name: newBuild, version: plan.product_version })).id : toId(raw.build, "build");

  const me = await currentUser(ctx);
  const run = await kiwi.createRun({ plan: planId, build, summary, manager: me.id, default_tester: defaultTester });
  for (const c of cases) {
    const execution = await kiwi.addCaseToRun(run.id, c.id);
    const assignee = c.assignee ?? defaultTester;
    if (assignee && execution.assignee !== assignee) await kiwi.updateExecution(execution.id, { assignee });
  }
  await markRunStarted(kiwi, planId); // tarefa do plano no Azure → "Em Teste"
  return { run };
});
