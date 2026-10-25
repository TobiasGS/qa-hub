import "server-only";
import type { CaseOptions } from "@/components/case-form";
import type { PlanOptions } from "@/components/plan-form";
import type { KiwiApi } from "./kiwi/types";
import type { Visible } from "./visibility";

// Listas de apoio dos formulários, carregadas no servidor.

/** Projetos que o usuário pode escolher: os visíveis para ele (admin vendo tudo: todos). */
export async function planOptions(kiwi: KiwiApi, visible: Visible | null = null): Promise<PlanOptions> {
  const projects = (await kiwi.products()).filter((p) => !visible || visible.projectIds.has(p.id));
  return { projects: projects.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")) };
}

export async function caseOptions(kiwi: KiwiApi, productId: number): Promise<CaseOptions> {
  const [priorities, categories, statuses] = await Promise.all([kiwi.priorities(), kiwi.categories({ product: productId }), kiwi.caseStatuses()]);
  return { priorities, categories, statuses };
}
