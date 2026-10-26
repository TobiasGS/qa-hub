import "server-only";
import { ApiError } from "./api";
import { azureConfig } from "./azure";
import { isEvidence } from "./evidence/shared";
import type { KiwiApi } from "./kiwi/types";
import { azureIdOf, parseRequirements, trackerOf } from "./requirements";

export const AZURE_NOT_CONFIGURED =
  "O Azure DevOps ainda não está configurado: coloque o seu PAT em AZURE_DEVOPS_PAT no web/.env.local (escopo Work Items: Read & Write) e reinicie o QA Hub.";

/**
 * Para onde vai o bug de uma execução: o card do plano define o destino.
 *   azure-N → Azure DevOps (filho do card)
 *   jira-N ou nenhum card → bug tracker configurado no Kiwi (Bug.report)
 */
export async function bugContext(kiwi: KiwiApi, executionId: number) {
  const [execution] = await kiwi.executions({ id: executionId });
  if (!execution) throw new ApiError("Execução não encontrada", 404);
  const [run] = await kiwi.runs({ id: execution.run });
  if (!run) throw new ApiError("Run não encontrado", 404);
  const [plan] = await kiwi.plans({ id: run.plan });
  const cardKey = plan?.extra_link ? (parseRequirements(plan.extra_link).keys[0] ?? null) : null;
  const tracker = cardKey ? trackerOf(cardKey) : null;
  return {
    execution,
    run,
    plan,
    cardKey,
    destination: tracker === "azure" ? ("azure" as const) : ("kiwi" as const),
    azureParentId: tracker === "azure" ? azureIdOf(cardKey) : null,
    azureConfigured: azureConfig() !== null,
  };
}

/** Dados da execução para o Repro Steps do bug. */
export async function reproData(kiwi: KiwiApi, ctx: Awaited<ReturnType<typeof bugContext>>, origin: string) {
  const { execution, run } = ctx;
  const [[testCase], comments, links] = await Promise.all([kiwi.cases({ id: execution.case }), kiwi.comments(execution.id), kiwi.links({ execution: execution.id })]);
  return {
    caseTitle: `TC-${execution.case} ${execution.case__summary}`,
    steps: testCase?.text ?? "",
    comments: comments.map((c) => c.comment).filter((c) => !c.includes("[qahub-timer:")),
    evidence: links.filter(isEvidence).map((l) => ({ name: l.name, url: l.url })),
    run: `#${run.id} ${run.summary}`,
    build: execution.build__name,
    tester: execution.tested_by__username ?? execution.assignee__username ?? "—",
    link: `${origin}/runs/${run.id}/execute?e=${execution.id}`,
  };
}
