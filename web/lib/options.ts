import "server-only";
import type { CaseOptions } from "@/components/case-form";
import type { PlanOptions } from "@/components/plan-form";
import type { KiwiApi } from "./kiwi/types";

// Listas de apoio dos formulários, carregadas no servidor.

export async function planOptions(kiwi: KiwiApi): Promise<PlanOptions> {
  const projects = await kiwi.products();
  return { projects: projects.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")) };
}

export async function caseOptions(kiwi: KiwiApi, productId: number): Promise<CaseOptions> {
  const [priorities, categories, statuses] = await Promise.all([kiwi.priorities(), kiwi.categories({ product: productId }), kiwi.caseStatuses()]);
  return { priorities, categories, statuses };
}
