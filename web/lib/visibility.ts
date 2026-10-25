import "server-only";
import { ApiError } from "./api";
import type { KiwiApi, Product, TestCase, TestExecution, TestPlan, TestRun } from "./kiwi/types";
import type { Viewer } from "./session";

// Perfis do QA Hub: cada pessoa vê o que criou + o que foi atribuído a ela.
// Admin (superusuário do Kiwi) vê tudo, a não ser que escolha "só os meus".
//
//   Run      → é manager ou testador padrão, tem execução atribuída, ou o run é de um plano dela
//   Plano    → é autora, ou tem algum run visível nele (aí em modo leitura)
//   Projeto  → é dona (marca na description) ou tem plano visível nele
//   Caso     → está num plano visível, ou é autora

export interface Visible {
  runIds: Set<number>;
  planIds: Set<number>;
  ownedPlanIds: Set<number>;
  projectIds: Set<number>;
  caseIds: Set<number>;
}

const OWNER = /\[qahub-owner:([^\]]+)\]/;
/** O Kiwi não registra quem criou o projeto; o QA Hub guarda na description. */
export const ownerTag = (username: string) => `[qahub-owner:${username}]`;
export const projectOwner = (p: Product) => p.description?.match(OWNER)?.[1] ?? null;

export const seesAll = (v: Viewer) => v.isAdmin && v.scope === "all";

/** null = sem filtro (admin vendo tudo). */
export async function visibleSet(kiwi: KiwiApi, viewer: Viewer): Promise<Visible | null> {
  if (seesAll(viewer)) return null;
  const u = viewer.username;

  const [ownPlans, asManager, asTester, assigned, products] = await Promise.all([
    kiwi.plans({ author__username: u }),
    kiwi.runs({ manager__username: u }),
    kiwi.runs({ default_tester__username: u }),
    kiwi.executions({ assignee__username: u }),
    kiwi.products(),
  ]);
  const ownedPlanIds = new Set(ownPlans.map((p) => p.id));
  const ownPlanRuns = ownedPlanIds.size ? await kiwi.runs({ plan__in: [...ownedPlanIds] }) : [];

  const runs = new Map<number, TestRun>();
  for (const r of [...asManager, ...asTester, ...ownPlanRuns]) runs.set(r.id, r);
  // Runs onde a pessoa só tem execução atribuída: busca para saber o plano.
  const missing = [...new Set(assigned.map((e) => e.run))].filter((id) => !runs.has(id));
  if (missing.length) for (const r of await kiwi.runs({ id__in: missing })) runs.set(r.id, r);

  const planIds = new Set([...ownedPlanIds, ...[...runs.values()].map((r) => r.plan)]);
  const [plans, cases, ownCases] = await Promise.all([
    planIds.size ? kiwi.plans({ id__in: [...planIds] }) : Promise.resolve([] as TestPlan[]),
    planIds.size ? kiwi.cases({ plan__in: [...planIds] }) : Promise.resolve([] as TestCase[]),
    kiwi.cases({ author__username: u }),
  ]);

  return {
    runIds: new Set(runs.keys()),
    planIds,
    ownedPlanIds,
    projectIds: new Set([...products.filter((p) => projectOwner(p) === u).map((p) => p.id), ...plans.map((p) => p.product)]),
    caseIds: new Set([...cases, ...ownCases].map((c) => c.id)),
  };
}

export const canSeeRun = (vis: Visible | null, runId: number) => vis === null || vis.runIds.has(runId);
export const canSeePlan = (vis: Visible | null, planId: number) => vis === null || vis.planIds.has(planId);
export const canSeeCase = (vis: Visible | null, caseId: number) => vis === null || vis.caseIds.has(caseId);
export const canSeeProject = (vis: Visible | null, projectId: number) => vis === null || vis.projectIds.has(projectId);

/** Editar plano (dados, arquivar, casos, novos runs): autor ou admin. */
export const canEditPlan = (viewer: Viewer, plan: Pick<TestPlan, "author__username">) => viewer.isAdmin || plan.author__username === viewer.username;

// ── Guardas para as rotas /api (404 quando não pode ver, 403 quando vê mas não pode mexer) ──

export async function requirePlanEditable(kiwi: KiwiApi, viewer: Viewer, planId: number): Promise<TestPlan> {
  const [plan] = await kiwi.plans({ id: planId });
  if (!plan) throw new ApiError("Plano não encontrado", 404);
  if (!canEditPlan(viewer, plan)) {
    const vis = await visibleSet(kiwi, viewer);
    throw canSeePlan(vis, planId) ? new ApiError("Só quem criou o plano (ou um admin) pode alterá-lo", 403) : new ApiError("Plano não encontrado", 404);
  }
  return plan;
}

/** Editar caso: autor do caso, dono de um plano que o contém, ou admin. */
export async function requireCaseEditable(kiwi: KiwiApi, viewer: Viewer, caseId: number): Promise<TestCase> {
  const [testCase] = await kiwi.cases({ id: caseId });
  if (!testCase) throw new ApiError("Caso não encontrado", 404);
  if (viewer.isAdmin || testCase.author__username === viewer.username) return testCase;
  const owned = await kiwi.plans({ cases: caseId, author__username: viewer.username });
  if (owned.length) return testCase;
  const vis = await visibleSet(kiwi, viewer);
  throw canSeeCase(vis, caseId) ? new ApiError("Só quem criou o caso ou o plano (ou um admin) pode alterá-lo", 403) : new ApiError("Caso não encontrado", 404);
}

export async function requireRunVisible(kiwi: KiwiApi, viewer: Viewer, runId: number): Promise<void> {
  if (!canSeeRun(await visibleSet(kiwi, viewer), runId)) throw new ApiError("Run não encontrado", 404);
}

/** Mexer numa execução (status, cronômetro, evidência, bug): quem pode ver o run dela. */
export async function requireExecutionVisible(kiwi: KiwiApi, viewer: Viewer, executionId: number): Promise<TestExecution> {
  const [execution] = await kiwi.executions({ id: executionId });
  if (!execution) throw new ApiError("Execução não encontrada", 404);
  await requireRunVisible(kiwi, viewer, execution.run);
  return execution;
}

export async function requireCaseVisible(kiwi: KiwiApi, viewer: Viewer, caseId: number): Promise<void> {
  if (!canSeeCase(await visibleSet(kiwi, viewer), caseId)) throw new ApiError("Caso não encontrado", 404);
}
