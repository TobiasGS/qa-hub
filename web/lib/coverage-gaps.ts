// Cards (histórias filhas do card do plano, ou o próprio card) que ainda não têm caso de teste.
// Módulo puro, para testar sem Azure nem Kiwi; a busca dos dados fica em lib/coverage.ts.

import type { TestCase } from "./kiwi/types";
import { parseRequirements } from "./requirements";

export interface GapCard {
  id: number;
  title: string;
  type: string;
  state: string;
}

export interface PlanCards {
  plan: { id: number; name: string };
  card: GapCard;
  children: GapCard[];
}

export interface CoverageGap extends GapCard {
  key: string;
  plan: { id: number; name: string };
  /** Card filho do card do plano (false = o próprio card do plano, que não tem filhos). */
  isChild: boolean;
}

/** Chaves de card citadas por casos ativos (azure-86; AB#86 também vira azure-86). */
export function coveredKeys(cases: Pick<TestCase, "requirement" | "case_status__name">[]): Set<string> {
  const keys = new Set<string>();
  for (const c of cases) {
    if (c.case_status__name === "DISABLED") continue;
    for (const k of parseRequirements(c.requirement).keys) keys.add(k);
  }
  return keys;
}

export function findGaps(plans: PlanCards[], covered: Set<string>): CoverageGap[] {
  const seen = new Set<string>();
  const gaps: CoverageGap[] = [];
  for (const p of plans) {
    const targets = p.children.length ? p.children.map((c) => ({ c, isChild: true })) : [{ c: p.card, isChild: false }];
    for (const { c, isChild } of targets) {
      const key = `azure-${c.id}`;
      if (covered.has(key) || seen.has(key)) continue;
      seen.add(key);
      gaps.push({ ...c, key, plan: p.plan, isChild });
    }
  }
  return gaps;
}
