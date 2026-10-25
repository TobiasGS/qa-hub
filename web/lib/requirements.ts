// Chaves de card do Jira (SHOP-123) e do Azure Boards (AB#456), guardadas no
// campo `requirement` do caso (várias, separadas por vírgula) e no `extra_link`
// do plano. Este módulo é puro: roda no servidor e no navegador.

export type Tracker = "jira" | "azure";

export interface RequirementTemplates {
  jira: string | null;
  azure: string | null;
}

const JIRA = /^[A-Z][A-Z0-9]+-\d+$/;
const AZURE = /^AB#\d+$/i;

export function trackerOf(key: string): Tracker | null {
  if (JIRA.test(key)) return "jira";
  if (AZURE.test(key)) return "azure";
  return null;
}

/**
 * Link colado do card → chave. Azure DevOps (nuvem ou Server): `?workitem=86`
 * (quadro/sprint) ou `/_workitems/edit/86` → AB#86. Jira: `/browse/SHOP-1` → SHOP-1.
 */
function keyFromUrl(token: string): string {
  if (!/^https?:\/\//i.test(token)) return token;
  const azure = token.match(/[?&]workitem=(\d+)/i) ?? token.match(/\/_workitems\/edit\/(\d+)/i);
  if (azure) return `AB#${azure[1]}`;
  const jira = token.match(/\/browse\/([A-Z][A-Z0-9]+-\d+)/i) ?? token.match(/[?&]selectedIssue=([A-Z][A-Z0-9]+-\d+)/i);
  return jira ? jira[1] : token;
}

/** "shop-1, AB#2 ; SHOP-1" → { keys: ["SHOP-1", "AB#2"], invalid: [] }. Aceita também o link do card. */
export function parseRequirements(raw: string | null | undefined): { keys: string[]; invalid: string[] } {
  const tokens = (raw ?? "")
    .split(/[,;\s]+/)
    .map((t) => keyFromUrl(t.trim()).toUpperCase())
    .filter(Boolean);
  const unique = [...new Set(tokens)];
  return { keys: unique.filter((t) => trackerOf(t)), invalid: unique.filter((t) => !trackerOf(t)) };
}

/** Normaliza para gravar no Kiwi: "SHOP-1, AB#2" (ou null se vazio). */
export function formatRequirements(keys: string[]): string | null {
  return keys.length ? keys.join(", ") : null;
}

export function requirementUrl(key: string, templates: RequirementTemplates): string | null {
  const tracker = trackerOf(key);
  const tpl = tracker ? templates[tracker] : null;
  if (!tpl) return null;
  return tpl.replace("{key}", encodeURIComponent(tracker === "azure" ? key.replace(/^AB#/i, "") : key));
}

/** Lê os modelos de URL do ambiente (só no servidor). */
export function requirementTemplates(): RequirementTemplates {
  return {
    jira: process.env.REQUIREMENT_URL_JIRA ?? process.env.REQUIREMENT_URL ?? null,
    azure: process.env.REQUIREMENT_URL_AZURE ?? (process.env.AZURE_DEVOPS_URL ? `${process.env.AZURE_DEVOPS_URL.replace(/\/$/, "")}/_workitems/edit/{key}` : null),
  };
}
