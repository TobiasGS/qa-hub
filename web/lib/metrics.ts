import type { ExecutionStatus, KiwiApi, LinkReference, TestCase, TestExecution, TestRun } from "./kiwi/types";
import { parseRequirements } from "./requirements";
import { durationOf, parseKiwiDate } from "./timer";
import type { Visible } from "./visibility";

export type Outcome = "passed" | "failed" | "blocked" | "pending";

export const OUTCOME_LABEL: Record<Outcome, string> = {
  passed: "Passou",
  failed: "Falhou",
  blocked: "Bloqueado",
  pending: "Pendente",
};

/** Traduz o status do Kiwi para as 4 categorias do QA Hub, usando o `weight`. */
export function outcomeOf(statusId: number, statuses: ExecutionStatus[]): Outcome {
  const s = statuses.find((x) => x.id === statusId);
  if (!s || s.weight === 0) return "pending";
  if (s.weight > 0) return "passed";
  return s.name === "BLOCKED" ? "blocked" : "failed";
}

export interface Summary {
  passed: number;
  failed: number;
  blocked: number;
  pending: number;
  total: number;
  executed: number;
  /** % de execuções que passaram, entre as já executadas; null se nada foi executado. */
  passRate: number | null;
}

export function summarize(executions: TestExecution[], statuses: ExecutionStatus[]): Summary {
  const s = { passed: 0, failed: 0, blocked: 0, pending: 0 };
  for (const e of executions) s[outcomeOf(e.status, statuses)]++;
  const executed = s.passed + s.failed + s.blocked;
  return { ...s, total: executions.length, executed, passRate: executed ? (s.passed / executed) * 100 : null };
}

const byStartDesc = (a: TestRun, b: TestRun) => (b.start_date ?? "").localeCompare(a.start_date ?? "") || b.id - a.id;

/** Quantas builds recentes (por projeto) o dashboard considera. */
const BUILD_WINDOW = 6;

const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Segunda-feira da semana (UTC), para agrupar a tendência quando há vários projetos. */
function weekStart(iso: string) {
  const d = new Date(parseKiwiDate(iso));
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * Dados do dashboard. Com `project`, a tendência é por build daquele projeto;
 * com todos os projetos, as builds não são comparáveis entre si e a tendência é por semana.
 */
/** `visible` = o que o usuário pode ver (lib/visibility.ts); null = tudo (admin). */
export async function dashboardData(kiwi: KiwiApi, { project, visible }: { project: number | null; visible: Visible | null }) {
  const [runsAll, statuses, builds, plansAll, projectsAll] = await Promise.all([kiwi.runs(), kiwi.statuses(), kiwi.builds(), kiwi.plans(), kiwi.products()]);
  const allRuns = visible ? runsAll.filter((r) => visible.runIds.has(r.id)) : runsAll;
  const plans = visible ? plansAll.filter((p) => visible.planIds.has(p.id)) : plansAll;
  const projects = visible ? projectsAll.filter((p) => visible.projectIds.has(p.id)) : projectsAll;
  const planById = new Map(plans.map((p) => [p.id, p]));
  const productOf = (run: TestRun | undefined) => (run ? (planById.get(run.plan)?.product ?? 0) : 0);
  const runs = allRuns.filter((r) => !project || productOf(r) === project);

  // Builds recentes de cada projeto (a mais nova primeiro).
  const buildsByProduct = new Map<number, number[]>();
  for (const r of [...runs].sort(byStartDesc)) {
    const list = buildsByProduct.get(productOf(r)) ?? [];
    if (!list.includes(r.build)) list.push(r.build);
    buildsByProduct.set(productOf(r), list);
  }
  const lists = [...buildsByProduct.values()];
  const recent = new Set(lists.flatMap((l) => l.slice(0, BUILD_WINDOW)));
  const latestBuilds = new Set(lists.map((l) => l[0]).filter((b) => b !== undefined));
  const previousBuilds = new Set(lists.map((l) => l[1]).filter((b) => b !== undefined));

  const windowRuns = runs.filter((r) => recent.has(r.build)).sort(byStartDesc);
  const executions = windowRuns.length ? await kiwi.executions({ run__in: windowRuns.map((r) => r.id) }) : [];
  const defects = executions.length ? await kiwi.links({ execution__in: executions.map((e) => e.id), is_defect: true }) : [];

  const buildName = (id: number) => builds.find((b) => b.id === id)?.name ?? `Build ${id}`;
  const runById = new Map(windowRuns.map((r) => [r.id, r]));
  const isManual = (e: TestExecution) => planById.get(runById.get(e.run)?.plan ?? 0)?.type__name !== "Automatizado";

  const point = (label: string, title: string, list: TestExecution[]) => {
    const s = summarize(list, statuses);
    return { label, title, passRate: round1(s.passRate), executed: s.executed, failed: s.failed + s.blocked };
  };
  let trend: ReturnType<typeof point>[];
  if (project) {
    const ordered = (buildsByProduct.get(project) ?? []).slice(0, BUILD_WINDOW).reverse();
    trend = ordered.map((id) => point(buildName(id), `Build ${buildName(id)}`, executions.filter((e) => e.build === id)));
  } else {
    const weekOf = (e: TestExecution) => {
      const start = runById.get(e.run)?.start_date;
      return start ? weekStart(start) : null;
    };
    const weeks = [...new Set(executions.map(weekOf).filter((w): w is string => !!w))].sort().slice(-8);
    trend = weeks.map((w) => {
      const label = new Date(w + "T00:00:00Z").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
      return point(label, `Semana de ${label}`, executions.filter((e) => weekOf(e) === w));
    });
  }

  const latestExecutions = executions.filter((e) => latestBuilds.has(e.build));
  const latest = summarize(latestExecutions, statuses);
  const previous = previousBuilds.size ? summarize(executions.filter((e) => previousBuilds.has(e.build)), statuses) : null;
  /** Tempo médio por caso nas execuções manuais finalizadas (as automáticas levam segundos e distorceriam a média). */
  const avgManual = (list: TestExecution[]) =>
    mean(
      list
        .filter((e) => isManual(e) && outcomeOf(e.status, statuses) !== "pending")
        .map(durationOf)
        .filter((d): d is number => d !== null),
    );

  const runProgress = windowRuns.slice(0, 8).map((run) => ({ run, summary: summarize(executions.filter((e) => e.run === run.id), statuses) }));

  // Casos que mais falharam na janela.
  const fails = new Map<number, { caseId: number; summary: string; failed: number; total: number }>();
  for (const e of executions) {
    const o = outcomeOf(e.status, statuses);
    if (o === "pending") continue;
    const row = fails.get(e.case) ?? { caseId: e.case, summary: e.case__summary, failed: 0, total: 0 };
    row.total++;
    if (o === "failed" || o === "blocked") row.failed++;
    fails.set(e.case, row);
  }
  const topFailures = [...fails.values()].filter((r) => r.failed > 0).sort((a, b) => b.failed - a.failed || b.failed / b.total - a.failed / a.total).slice(0, 5);

  const execById = new Map(executions.map((e) => [e.id, e]));
  const recentDefects = [...defects]
    .sort((a, b) => b.created_on.localeCompare(a.created_on))
    .slice(0, 6)
    .map((l) => ({ link: l, execution: execById.get(l.execution) }));

  // Visão "todos os projetos": uma linha por projeto.
  const productOfExecution = (e: TestExecution) => productOf(runById.get(e.run));
  const byProject = project
    ? []
    : projects
        .map((proj) => {
          const latestId = buildsByProduct.get(proj.id)?.[0];
          const list = latestExecutions.filter((e) => e.build === latestId && productOfExecution(e) === proj.id);
          const ids = new Set(executions.filter((e) => productOfExecution(e) === proj.id).map((e) => e.id));
          return {
            project: proj,
            activePlans: plans.filter((p) => p.product === proj.id && p.is_active).length,
            build: latestId === undefined ? null : buildName(latestId),
            summary: summarize(list, statuses),
            bugs: new Set(defects.filter((d) => ids.has(d.execution)).map((d) => d.url)).size,
            avgSeconds: avgManual(list),
          };
        })
        .filter((row) => row.activePlans > 0 || row.summary.total > 0);

  return {
    projects,
    latestBuilds: [...latestBuilds].map(buildName),
    latest,
    previous,
    avgSeconds: avgManual(latestExecutions),
    openRuns: runs.filter((r) => !r.stop_date).length,
    defectCount: new Set(defects.map((d) => d.url)).size,
    trend,
    runProgress,
    topFailures,
    recentDefects,
    byProject,
  };
}

export interface TraceCase {
  case: TestCase;
  outcome: Outcome;
  lastExecution?: TestExecution;
  bugs: LinkReference[];
}

export interface TraceRow {
  requirement: string | null;
  cases: TraceCase[];
  /** Pior resultado entre os casos: define a cor da linha do requisito. */
  outcome: Outcome;
}

const SEVERITY: Outcome[] = ["failed", "blocked", "pending", "passed"];

export async function traceabilityData(kiwi: KiwiApi, visible: Visible | null) {
  const [casesAll, statuses] = await Promise.all([kiwi.cases(), kiwi.statuses()]);
  const cases = visible ? casesAll.filter((c) => visible.caseIds.has(c.id)) : casesAll;
  const executions = cases.length ? await kiwi.executions({ case__in: cases.map((c) => c.id) }) : [];
  const bugs = executions.length ? await kiwi.links({ execution__in: executions.map((e) => e.id), is_defect: true }) : [];

  // Última execução já executada de cada caso (maior id com status != pendente).
  const lastByCase = new Map<number, TestExecution>();
  for (const e of executions) {
    if (outcomeOf(e.status, statuses) === "pending") continue;
    const cur = lastByCase.get(e.case);
    if (!cur || e.id > cur.id) lastByCase.set(e.case, e);
  }
  const caseOfExecution = new Map(executions.map((e) => [e.id, e.case]));

  // Um caso com várias chaves ("azure-86, jira-1") aparece em cada requisito; AB#86 e azure-86 são o mesmo.
  // Casos desativados saem da matriz.
  const groups = new Map<string, TraceCase[]>();
  for (const c of cases) {
    if (c.case_status__name === "DISABLED") continue;
    const last = lastByCase.get(c.id);
    const entry: TraceCase = {
      case: c,
      outcome: last ? outcomeOf(last.status, statuses) : "pending",
      lastExecution: last,
      bugs: bugs.filter((b) => caseOfExecution.get(b.execution) === c.id),
    };
    const { keys, invalid } = parseRequirements(c.requirement);
    for (const key of [...keys, ...invalid].length ? [...keys, ...invalid] : [""]) {
      groups.set(key, [...(groups.get(key) ?? []), entry]);
    }
  }

  const rows: TraceRow[] = [...groups.entries()]
    .map(([req, list]) => ({
      requirement: req || null,
      cases: list,
      outcome: SEVERITY.find((o) => list.some((c) => c.outcome === o)) ?? "pending",
    }))
    .sort((a, b) => (a.requirement === null ? 1 : b.requirement === null ? -1 : a.requirement.localeCompare(b.requirement, "pt-BR", { numeric: true })));

  const withReq = rows.filter((r) => r.requirement);
  return {
    rows,
    stats: {
      requirements: withReq.length,
      covered: withReq.filter((r) => r.outcome === "passed").length,
      failing: withReq.filter((r) => r.outcome === "failed" || r.outcome === "blocked").length,
      notRun: withReq.filter((r) => r.outcome === "pending").length,
      orphanCases: rows.find((r) => r.requirement === null)?.cases.length ?? 0,
    },
  };
}
