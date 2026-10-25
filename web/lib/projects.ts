import "server-only";
import { ApiError } from "./api";
import type { KiwiApi, Product } from "./kiwi/types";
import { ownerTag } from "./visibility";

// "Projeto" no QA Hub = Product no Kiwi. O Kiwi exige versão em todo plano;
// como o QA Hub não usa versões, cada projeto usa uma só, a "unspecified".

export type PlanKind = "manual" | "automated";
const KIND_NAME: Record<PlanKind, string> = { manual: "Manual", automated: "Automatizado" };

export const kindOfTypeName = (name: string | undefined): PlanKind => (name === KIND_NAME.automated ? "automated" : "manual");

/** Versão usada pelos planos do projeto: "unspecified", a primeira que existir, ou uma nova. */
export async function projectVersion(kiwi: KiwiApi, product: number): Promise<number> {
  const versions = await kiwi.versions({ product });
  const chosen = versions.find((v) => v.value === "unspecified") ?? versions[0];
  return chosen ? chosen.id : (await kiwi.createVersion({ product, value: "unspecified" })).id;
}

/** PlanType "Manual" ou "Automatizado" (cria no Kiwi se ainda não existir). */
export async function planTypeId(kiwi: KiwiApi, kind: PlanKind): Promise<number> {
  const name = KIND_NAME[kind];
  const found = (await kiwi.planTypes()).find((t) => t.name.toLowerCase() === name.toLowerCase());
  return found ? found.id : (await kiwi.createPlanType({ name })).id;
}

/** Cria o projeto e grava o dono na description (o Kiwi não registra quem criou). */
export async function createProject(kiwi: KiwiApi, name: string, owner: string): Promise<Product> {
  if ((await kiwi.products()).some((p) => p.name.toLowerCase() === name.toLowerCase())) throw new ApiError(`Já existe um projeto chamado "${name}"`);
  const classifications = await kiwi.classifications();
  const classification = classifications.find((c) => c.name === "Projetos") ?? (await kiwi.createClassification({ name: "Projetos" }));
  const product = await kiwi.createProduct({ name, classification: classification.id, description: ownerTag(owner) });
  // O Kiwi costuma criar versão e categoria padrão sozinho; garantimos caso não crie.
  await projectVersion(kiwi, product.id);
  if (!(await kiwi.categories({ product: product.id })).length) await kiwi.createCategory({ product: product.id, name: "--default--" });
  return product;
}
