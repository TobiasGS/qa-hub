import type { ExecutionStatus, KiwiApi, LinkReference, TestExecution, TestRun } from "./kiwi/types";
import { outcomeOf, type Outcome } from "./metrics";

// Sinais das falhas de um run, calculados só com o histórico do Kiwi (sem IA):
//   regressão  · a execução anterior em outra build passou
//   recorrente · falhou em 2+ das últimas 5 execuções anteriores
//   instável   · alternou passou/falhou 2+ vezes nas últimas 6 (contando esta)
//   nova       · primeira execução do caso
//   sem bug    · falhou e não tem bug vinculado

export type SignalTag = "regression" | "recurring" | "flaky" | "new" | "no_bug";

export const SIGNAL_LABEL: Record<SignalTag, string> = {
  regression: "Regressão",
  recurring: "Recorrente",
  flaky: "Instável",
  new: "Nova",
  no_bug: "Sem bug",
};

export interface FailureSignal {
  executionId: number;
  caseId: number;
  summary: string;
  outcome: Outcome;
  tags: SignalTag[];
  /** Build em que o caso passou por último (quando é regressão). */
  lastPassBuild: string | null;
  /** Falhas / execuções nas últimas 5 anteriores. */
  failRate: { failed: number; total: number };
}

const isFail = (o: Outcome) => o === "failed" || o === "blocked";

/** Quantas vezes o resultado troca entre passou e falhou numa sequência (pendentes ignorados). */
export function flips(outcomes: Outcome[]): number {
  const done = outcomes.filter((o) => o !== "pending").map((o) => (isFail(o) ? "f" : "p"));
  let n = 0;
  for (let i = 1; i < done.length; i++) if (done[i] !== done[i - 1]) n++;
  return n;
}

/**
 * Sinais de uma execução que falhou, a partir das execuções ANTERIORES do mesmo caso
 * (qualquer ordem; ordenadas aqui por id) e de ela ter ou não bug vinculado.
 */
export function signalsFor(
  current: Pick<TestExecution, "id" | "build">,
  previous: Pick<TestExecution, "id" | "build" | "build__name" | "status">[],
  statuses: ExecutionStatus[],
  hasBug: boolean,
): Pick<FailureSignal, "tags" | "lastPassBuild" | "failRate"> {
  const before = previous.filter((e) => e.id < current.id).sort((a, b) => a.id - b.id);
  const done = before.filter((e) => outcomeOf(e.status, statuses) !== "pending");
  const tags: SignalTag[] = [];

  if (!done.length) tags.push("new");
  const lastOtherBuild = [...done].reverse().find((e) => e.build !== current.build);
  const regression = !!lastOtherBuild && outcomeOf(lastOtherBuild.status, statuses) === "passed";
  if (regression) tags.push("regression");

  const last5 = done.slice(-5).map((e) => outcomeOf(e.status, statuses));
  const failed = last5.filter(isFail).length;
  if (failed >= 2) tags.push("recurring");
  // Esta execução (falha) entra no fim da sequência.
  if (flips([...done.slice(-5).map((e) => outcomeOf(e.status, statuses)), "failed"]) >= 2) tags.push("flaky");
  if (!hasBug) tags.push("no_bug");

  return { tags, lastPassBuild: regression ? lastOtherBuild!.build__name : null, failRate: { failed, total: last5.length } };
}

/** Sinais de todas as execuções Falhou/Bloqueado do run. */
export async function failureSignals(
  kiwi: KiwiApi,
  run: Pick<TestRun, "id">,
  ctx?: { executions?: TestExecution[]; statuses?: ExecutionStatus[]; links?: LinkReference[] },
): Promise<FailureSignal[]> {
  const [executions, statuses] = await Promise.all([ctx?.executions ?? kiwi.executions({ run: run.id }), ctx?.statuses ?? kiwi.statuses()]);
  const failures = executions.filter((e) => isFail(outcomeOf(e.status, statuses)));
  if (!failures.length) return [];
  const [history, links] = await Promise.all([
    kiwi.executions({ case__in: [...new Set(failures.map((e) => e.case))] }),
    ctx?.links ?? kiwi.links({ execution__in: failures.map((e) => e.id) }),
  ]);
  return failures
    .sort((a, b) => a.sortkey - b.sortkey || a.id - b.id)
    .map((e) => ({
      executionId: e.id,
      caseId: e.case,
      summary: e.case__summary,
      outcome: outcomeOf(e.status, statuses),
      ...signalsFor(
        e,
        history.filter((h) => h.case === e.case && h.id !== e.id),
        statuses,
        links.some((l) => l.execution === e.id && l.is_defect),
      ),
    }));
}

/** Casos instáveis numa lista de execuções (dashboard): 2+ trocas passou/falhou nas últimas 6. */
export function flakyCaseIds(executions: TestExecution[], statuses: ExecutionStatus[]): Set<number> {
  const byCase = new Map<number, TestExecution[]>();
  for (const e of executions) byCase.set(e.case, [...(byCase.get(e.case) ?? []), e]);
  const ids = new Set<number>();
  for (const [caseId, list] of byCase) {
    const outcomes = list.sort((a, b) => a.id - b.id).slice(-6).map((e) => outcomeOf(e.status, statuses));
    if (flips(outcomes) >= 2) ids.add(caseId);
  }
  return ids;
}
