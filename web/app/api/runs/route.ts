import { ApiError, apiRoute, currentUser, readJson, toId, toText } from "@/lib/api";

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

  const [plan] = await kiwi.plans({ id: planId });
  if (!plan) throw new ApiError("Plano não encontrado", 404);

  const newBuild = toText(raw.newBuild, "nova build");
  const build = newBuild ? (await kiwi.createBuild({ name: newBuild, version: plan.product_version })).id : toId(raw.build, "build");

  const me = await currentUser(ctx);
  const run = await kiwi.createRun({ plan: planId, build, summary, manager: me.id, default_tester: defaultTester });
  for (const c of cases) {
    const execution = await kiwi.addCaseToRun(run.id, c.id);
    const assignee = c.assignee ?? defaultTester;
    if (assignee && execution.assignee !== assignee) await kiwi.updateExecution(execution.id, { assignee });
  }
  return { run };
});
