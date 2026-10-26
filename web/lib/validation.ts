import "server-only";
import { ApiError, toId, toText } from "./api";
import type { CaseInput, KiwiApi, PlanInput } from "./kiwi/types";
import { planTypeId, projectVersion, type PlanKind } from "./projects";
import { formatRequirements, parseRequirements, requirementTemplates, requirementUrl } from "./requirements";

const has = (raw: Record<string, unknown>, key: string) => key in raw;

/**
 * Card do plano: o Kiwi só aceita URL em TestPlan.extra_link. Uma chave (azure-86 / jira-100)
 * vira a URL do card pelo modelo do Azure/Jira; o QA Hub lê a chave de volta da URL.
 */
function planLink(value: unknown): string | null {
  const s = toText(value, "card", { max: 1024 });
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  const { keys, invalid } = parseRequirements(s);
  if (invalid.length || keys.length !== 1) throw new ApiError("Card do plano: use uma chave como azure-86 ou jira-100, ou cole o link do card");
  const url = requirementUrl(keys[0], requirementTemplates());
  if (!url) throw new ApiError(`Sem modelo de link para ${keys[0]}: configure REQUIREMENT_URL_AZURE, REQUIREMENT_URL_JIRA e JIRA_PROJECT_KEY, ou cole o link do card`);
  return url;
}

function requirement(value: unknown): string | null {
  const { keys, invalid } = parseRequirements(typeof value === "string" ? value : "");
  if (invalid.length) throw new ApiError(`Chave(s) inválida(s): ${invalid.join(", ")}. Use azure-86 (Azure), jira-123 (Jira) ou cole o link do card.`);
  return formatRequirements(keys);
}

function planKind(value: unknown): PlanKind {
  if (value === "manual" || value === "automated") return value;
  throw new ApiError("Tipo do plano: escolha Manual ou Automatizado");
}

/** Plano novo. A versão (exigida pelo Kiwi) e o PlanType são resolvidos aqui. */
export async function planInput(kiwi: KiwiApi, raw: Record<string, unknown>): Promise<PlanInput> {
  const product = toId(raw.product, "projeto");
  return {
    name: toText(raw.name, "nome", { required: true }),
    text: toText(raw.text, "descrição", { max: 20000 }),
    product,
    product_version: await projectVersion(kiwi, product),
    type: await planTypeId(kiwi, planKind(raw.type)),
    extra_link: planLink(raw.extra_link),
  };
}

/** Edição parcial: valida só o que veio. */
export async function planPatch(kiwi: KiwiApi, raw: Record<string, unknown>): Promise<Partial<PlanInput> & { is_active?: boolean }> {
  const out: Partial<PlanInput> & { is_active?: boolean } = {};
  if (has(raw, "name")) out.name = toText(raw.name, "nome", { required: true });
  if (has(raw, "text")) out.text = toText(raw.text, "descrição", { max: 20000 });
  if (has(raw, "product")) {
    out.product = toId(raw.product, "projeto");
    out.product_version = await projectVersion(kiwi, out.product);
  }
  if (has(raw, "type")) out.type = await planTypeId(kiwi, planKind(raw.type));
  if (has(raw, "extra_link")) out.extra_link = planLink(raw.extra_link);
  if (has(raw, "is_active")) out.is_active = raw.is_active === true;
  return out;
}

export function caseInput(raw: Record<string, unknown>): CaseInput {
  return {
    summary: toText(raw.summary, "título", { required: true }),
    text: toText(raw.text, "passos", { max: 20000 }),
    requirement: requirement(raw.requirement),
    priority: toId(raw.priority, "prioridade"),
    category: toId(raw.category, "categoria"),
    case_status: toId(raw.case_status, "status"),
    is_automated: raw.is_automated === true,
  };
}

export function casePatch(raw: Record<string, unknown>): Partial<CaseInput> {
  const out: Partial<CaseInput> = {};
  if (has(raw, "summary")) out.summary = toText(raw.summary, "título", { required: true });
  if (has(raw, "text")) out.text = toText(raw.text, "passos", { max: 20000 });
  if (has(raw, "requirement")) out.requirement = requirement(raw.requirement);
  if (has(raw, "priority")) out.priority = toId(raw.priority, "prioridade");
  if (has(raw, "category")) out.category = toId(raw.category, "categoria");
  if (has(raw, "case_status")) out.case_status = toId(raw.case_status, "status");
  if (has(raw, "is_automated")) out.is_automated = raw.is_automated === true;
  return out;
}
