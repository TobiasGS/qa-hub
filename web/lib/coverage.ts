import "server-only";
import { azureConfig, getCardWithChildren } from "./azure";
import { coveredKeys, findGaps, type CoverageGap, type PlanCards } from "./coverage-gaps";
import type { KiwiApi, TestCase } from "./kiwi/types";
import { planCardId } from "./plan-task";
import type { Visible } from "./visibility";

export interface CoverageResult {
  gaps: CoverageGap[];
  /** Cards que não deu para ler no Azure (a página mostra um aviso, sem quebrar). */
  errors: string[];
}

const CONCURRENCY = 4;

/**
 * Cards dos planos ativos (histórias filhas, ou o próprio card) sem nenhum caso de teste.
 * Sem Azure configurado devolve null e a seção não aparece.
 */
export async function coverageGaps(kiwi: KiwiApi, visible: Visible | null, cases: TestCase[]): Promise<CoverageResult | null> {
  if (!azureConfig()) return null;
  const plans = (await kiwi.plans({ is_active: true })).filter((p) => !visible || visible.planIds.has(p.id));
  const withCard = plans.map((p) => ({ plan: p, cardId: planCardId(p) })).filter((x): x is { plan: (typeof plans)[number]; cardId: number } => !!x.cardId);
  if (!withCard.length) return { gaps: [], errors: [] };

  const found: PlanCards[] = [];
  const errors: string[] = [];
  for (let i = 0; i < withCard.length; i += CONCURRENCY) {
    await Promise.all(
      withCard.slice(i, i + CONCURRENCY).map(async ({ plan, cardId }) => {
        try {
          const { card, children } = await getCardWithChildren(cardId);
          found.push({ plan: { id: plan.id, name: plan.name }, card, children });
        } catch (e) {
          errors.push(`azure-${cardId} (${plan.name}): ${(e as Error).message}`);
        }
      }),
    );
  }
  found.sort((a, b) => a.plan.name.localeCompare(b.plan.name, "pt-BR"));
  return { gaps: findGaps(found, coveredKeys(cases)), errors };
}
