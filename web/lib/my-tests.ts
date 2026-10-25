import "server-only";
import type { KiwiApi, TestExecution, TestRun } from "./kiwi/types";
import { outcomeOf } from "./metrics";

/** Execuções ainda pendentes atribuídas ao usuário, agrupadas por run (mais recentes primeiro). */
export async function myPendingTests(kiwi: KiwiApi, username: string) {
  const [executions, statuses] = await Promise.all([kiwi.executions({ assignee__username: username }), kiwi.statuses()]);
  const pending = executions.filter((e) => outcomeOf(e.status, statuses) === "pending");
  if (!pending.length) return { total: 0, groups: [] as { run: TestRun; executions: TestExecution[] }[] };

  const runs = await kiwi.runs({ id__in: [...new Set(pending.map((e) => e.run))] });
  const groups = runs
    .map((run) => ({ run, executions: pending.filter((e) => e.run === run.id).sort((a, b) => a.sortkey - b.sortkey) }))
    .sort((a, b) => (b.run.start_date ?? "").localeCompare(a.run.start_date ?? "") || b.run.id - a.run.id);
  return { total: pending.length, groups };
}
