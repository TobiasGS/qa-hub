import "server-only";
import type { KiwiApi, LinkReference, TestPlan, TestRun } from "./kiwi/types";
import { OUTCOME_LABEL, outcomeOf, summarize, type Outcome, type Summary } from "./metrics";
import { readDiagnosis, type SavedDiagnosis } from "./run-diagnosis";
import { durationOf, parseKiwiDate } from "./timer";

// Dados do relatório de um run, usados pela página de impressão (PDF) e pelo CSV.

export interface ReportRow {
  caseId: number;
  title: string;
  requirement: string;
  priority: string;
  outcome: Outcome;
  status: string;
  tester: string;
  start: string | null;
  stop: string | null;
  /** Segundos; null sem cronômetro confiável. */
  duration: number | null;
  bugs: LinkReference[];
}

export interface RunReport {
  run: TestRun;
  plan: TestPlan | undefined;
  summary: Summary;
  rows: ReportRow[];
  bugs: LinkReference[];
  diagnosis: SavedDiagnosis | null;
}

export async function runReport(kiwi: KiwiApi, run: TestRun): Promise<RunReport> {
  const [executions, statuses, [plan]] = await Promise.all([kiwi.executions({ run: run.id }), kiwi.statuses(), kiwi.plans({ id: run.plan })]);
  const ids = executions.map((e) => e.id);
  const [links, cases] = await Promise.all([
    ids.length ? kiwi.links({ execution__in: ids, is_defect: true }) : [],
    executions.length ? kiwi.cases({ id__in: executions.map((e) => e.case) }) : [],
  ]);
  const caseById = new Map(cases.map((c) => [c.id, c]));
  const bugs = links.filter((l) => l.is_defect);
  const rows = [...executions]
    .sort((a, b) => a.sortkey - b.sortkey || a.id - b.id)
    .map((e): ReportRow => {
      const c = caseById.get(e.case);
      const outcome = outcomeOf(e.status, statuses);
      return {
        caseId: e.case,
        title: c?.summary ?? e.case__summary,
        requirement: c?.requirement ?? "",
        priority: c?.priority__value ?? "",
        outcome,
        status: e.status__name === "RUNNING" ? "Em execução" : e.status__name === "PAUSED" ? "Pausado" : OUTCOME_LABEL[outcome],
        tester: e.tested_by__username ?? e.assignee__username ?? "",
        start: e.start_date,
        stop: e.stop_date,
        duration: outcome === "pending" ? null : durationOf(e),
        bugs: bugs.filter((l) => l.execution === e.id),
      };
    });
  return { run, plan, summary: summarize(executions, statuses), rows, bugs, diagnosis: readDiagnosis(run.notes) };
}

/** Data do Kiwi (UTC) no horário de Brasília, "dd/mm/aaaa hh:mm". */
export function formatKiwiDate(value: string | null): string {
  if (!value) return "";
  return new Date(parseKiwiDate(value))
    .toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    .replace(",", "");
}
