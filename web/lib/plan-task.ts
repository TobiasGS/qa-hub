import "server-only";
import { AzureError, azureConfig, createChildWorkItem, escapeHtml, updateWorkItem, workItemHtmlUrl } from "./azure";
import type { KiwiApi, TestPlan } from "./kiwi/types";
import { azureIdOf, parseRequirements } from "./requirements";

// Tarefa "Plano de Teste" no Azure DevOps, filha do card do plano (azure-N).
// O vínculo fica numa tag do plano no Kiwi: "qahub-azure-task:<tarefa>@<card>".
// Com o card na tag, o QA Hub percebe quando o plano passa a apontar para outro card.

const TAG = /^qahub-azure-task:(\d+)@(\d+)$/;
const tagOf = (taskId: number, cardId: number) => `qahub-azure-task:${taskId}@${cardId}`;

/** Estados da Tarefa no fluxo da empresa (configuráveis, para outros processos). */
export const TASK_STATES = {
  testing: process.env.AZURE_STATE_TESTING ?? "Em Teste",
  passed: process.env.AZURE_STATE_PASSED ?? "Testado",
  failed: process.env.AZURE_STATE_FAILED ?? "Teste Recusado",
};

export interface PlanTask {
  taskId: number;
  cardId: number;
  url: string | null;
}

/** Card do Azure do plano (azure-86 → 86), ou null. */
export const planCardId = (plan: Pick<TestPlan, "extra_link">) => (plan.extra_link ? azureIdOf(parseRequirements(plan.extra_link).keys[0]) : null);

export async function planTask(kiwi: KiwiApi, planId: number): Promise<PlanTask | null> {
  for (const tag of await kiwi.planTags(planId)) {
    const m = tag.match(TAG);
    if (m) {
      const cfg = azureConfig();
      return { taskId: Number(m[1]), cardId: Number(m[2]), url: cfg ? workItemHtmlUrl(cfg.base, Number(m[1])) : null };
    }
  }
  return null;
}

export interface EnsureResult {
  task: PlanTask | null;
  created: boolean;
  /** Motivo de não ter criado (Azure não configurado, sem acesso ao card…). Nunca impede salvar o plano. */
  warning?: string;
}

/**
 * Garante a tarefa do plano: cria se o plano tem card azure-N e ainda não há
 * tarefa para esse card. Falha no Azure vira `warning`, sem derrubar quem chamou.
 */
export async function ensurePlanTask(kiwi: KiwiApi, plan: TestPlan, origin: string): Promise<EnsureResult> {
  const cardId = planCardId(plan);
  const current = await planTask(kiwi, plan.id);
  if (!cardId) return { task: current, created: false };
  if (current?.cardId === cardId) return { task: current, created: false };
  if (!azureConfig()) return { task: current, created: false, warning: "Azure DevOps não configurado (AZURE_DEVOPS_URL e AZURE_DEVOPS_PAT): a tarefa do plano não foi criada." };

  const link = `${origin}/plans/${plan.id}`;
  try {
    const created = await createChildWorkItem({
      parentId: cardId,
      type: azureConfig()!.taskType,
      title: `Plano de Teste: ${plan.name}`,
      fields: {
        "System.Description": [
          `<p>Plano de teste do QA Hub: <a href="${escapeHtml(link)}">${escapeHtml(plan.name)}</a></p>`,
          plan.text?.trim() ? `<p>${escapeHtml(plan.text.trim()).replace(/\n/g, "<br>")}</p>` : "",
          "<p>O estado desta tarefa acompanha os testes: <b>Em Teste</b> durante o run, <b>Testado</b> ou <b>Teste Recusado</b> ao terminar.</p>",
        ].join(""),
      },
      hyperlink: link,
      relationComment: "Plano de teste criado no QA Hub",
      hyperlinkComment: "Plano no QA Hub",
    });
    // Troca o vínculo: a tarefa do card antigo continua no Azure, só deixa de ser acompanhada.
    if (current) await kiwi.removePlanTag(plan.id, tagOf(current.taskId, current.cardId));
    await kiwi.addPlanTag(plan.id, tagOf(created.id, cardId));
    return { task: { taskId: created.id, cardId, url: created.url }, created: true };
  } catch (e) {
    return { task: current, created: false, warning: `Não foi possível criar a tarefa no Azure: ${e instanceof AzureError ? e.message : (e as Error).message}` };
  }
}

/** Mantém o título da tarefa igual ao nome do plano. */
export async function renamePlanTask(kiwi: KiwiApi, plan: TestPlan): Promise<void> {
  const task = await planTask(kiwi, plan.id);
  if (task && azureConfig()) await updateWorkItem(task.taskId, { title: `Plano de Teste: ${plan.name}` }).catch((e) => console.error("[plan-task] renomear:", e.message));
}

/** Move a tarefa do plano para um estado. Erros só vão para o log (não bloqueiam a execução dos testes). */
export async function setPlanTaskState(kiwi: KiwiApi, planId: number, state: string): Promise<void> {
  const task = await planTask(kiwi, planId);
  if (!task || !azureConfig()) return;
  await updateWorkItem(task.taskId, { state }).catch((e) => console.error(`[plan-task] estado "${state}" na tarefa ${task.taskId}:`, e.message));
}
