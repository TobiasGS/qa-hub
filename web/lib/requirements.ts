// Chaves de card guardadas no campo `requirement` do caso (várias, separadas por
// vírgula) e no `extra_link` do plano. Formato do QA Hub:
//   azure-86       → work item 86 do Azure DevOps
//   jira-86        → issue 86 do projeto Jira padrão (JIRA_PROJECT_KEY, ex.: SHOP-86)
//   jira-OUTRO-86  → issue de outro projeto Jira (OUTRO-86)
// Também aceita o formato antigo (AB#86, SHOP-86) e o link colado do card.
// Este módulo é puro: roda no servidor e no navegador.

export type Tracker = "jira" | "azure";

export interface RequirementTemplates {
  jira: string | null;
  azure: string | null;
  /** Projeto Jira padrão: "jira-86" vira "<projeto>-86". */
  jiraProject: string | null;
}

/** No servidor lê JIRA_PROJECT_KEY; no navegador as telas passam `templates.jiraProject`. */
const envJiraProject = (): string | null => (typeof window === "undefined" ? (process.env.JIRA_PROJECT_KEY?.trim().toUpperCase() ?? null) || null : null);

function jiraKey(project: string, number: string, jiraProject: string | null) {
  const p = project.toUpperCase();
  return jiraProject && p === jiraProject.toUpperCase() ? `jira-${number}` : `jira-${p}-${number}`;
}

/** Qualquer forma aceita → chave canônica (azure-86 / jira-86 / jira-OUTRO-86), ou null se não for chave. */
export function canonicalKey(token: string, jiraProject: string | null = envJiraProject()): string | null {
  let t = token.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) {
    const azure = t.match(/[?&]workitem=(\d+)/i) ?? t.match(/\/_workitems\/edit\/(\d+)/i);
    if (azure) return `azure-${azure[1]}`;
    const jira = t.match(/\/browse\/([A-Z][A-Z0-9]+)-(\d+)/i) ?? t.match(/[?&]selectedIssue=([A-Z][A-Z0-9]+)-(\d+)/i);
    return jira ? jiraKey(jira[1], jira[2], jiraProject) : null;
  }
  t = t.toUpperCase();
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^(?:AZURE-|AB#)(\d+)$/))) return `azure-${m[1]}`;
  if ((m = t.match(/^JIRA-(\d+)$/))) return `jira-${m[1]}`;
  if ((m = t.match(/^JIRA-([A-Z][A-Z0-9]+)-(\d+)$/))) return jiraKey(m[1], m[2], jiraProject);
  if ((m = t.match(/^([A-Z][A-Z0-9]+)-(\d+)$/))) return jiraKey(m[1], m[2], jiraProject); // formato antigo: SHOP-86
  return null;
}

export function trackerOf(key: string): Tracker | null {
  const c = canonicalKey(key);
  return c ? (c.startsWith("azure-") ? "azure" : "jira") : null;
}

/** Número do work item do Azure (azure-86 → 86), ou null se não for chave do Azure. */
export function azureIdOf(key: string | null | undefined): number | null {
  const m = key ? canonicalKey(key)?.match(/^azure-(\d+)$/) : null;
  return m ? Number(m[1]) : null;
}

/** "azure-86, AB#86 ; SHOP-1" → { keys: ["azure-86", "jira-1"], invalid: [] }. Aceita também o link do card. */
export function parseRequirements(raw: string | null | undefined, jiraProject: string | null = envJiraProject()): { keys: string[]; invalid: string[] } {
  const keys = new Set<string>();
  const invalid = new Set<string>();
  for (const token of (raw ?? "").split(/[,;\s]+/).filter(Boolean)) {
    const c = canonicalKey(token, jiraProject);
    if (c) keys.add(c);
    else invalid.add(token.toUpperCase());
  }
  return { keys: [...keys], invalid: [...invalid] };
}

/** Normaliza para gravar no Kiwi: "azure-86, jira-12" (ou null se vazio). */
export function formatRequirements(keys: string[]): string | null {
  return keys.length ? keys.join(", ") : null;
}

export function requirementUrl(key: string, templates: RequirementTemplates): string | null {
  const c = canonicalKey(key, templates.jiraProject);
  if (!c) return null;
  let m: RegExpMatchArray | null;
  if ((m = c.match(/^azure-(\d+)$/))) return templates.azure ? templates.azure.replace("{key}", m[1]) : null;
  if (!templates.jira) return null;
  if ((m = c.match(/^jira-(\d+)$/))) return templates.jiraProject ? templates.jira.replace("{key}", encodeURIComponent(`${templates.jiraProject}-${m[1]}`)) : null;
  if ((m = c.match(/^jira-([A-Z][A-Z0-9]+)-(\d+)$/))) return templates.jira.replace("{key}", encodeURIComponent(`${m[1]}-${m[2]}`));
  return null;
}

/** Lê os modelos de URL do ambiente (só no servidor). */
export function requirementTemplates(): RequirementTemplates {
  return {
    jira: process.env.REQUIREMENT_URL_JIRA ?? process.env.REQUIREMENT_URL ?? null,
    azure: process.env.REQUIREMENT_URL_AZURE ?? (process.env.AZURE_DEVOPS_URL ? `${process.env.AZURE_DEVOPS_URL.replace(/\/$/, "")}/_workitems/edit/{key}` : null),
    jiraProject: envJiraProject(),
  };
}
