import "server-only";

// Cliente mínimo da REST API do Azure DevOps (nuvem ou Server on-premises),
// usado para criar o Bug como filho do card do plano.
//   AZURE_DEVOPS_URL   https://<servidor>/tfs/<coleção>/<projeto>  (ou https://dev.azure.com/<org>/<projeto>)
//   AZURE_DEVOPS_PAT   Personal Access Token com Work Items (Read & Write) — secret, nunca vai ao navegador
//   AZURE_API_VERSION  padrão 6.0 (Azure DevOps Server 2020+)
//   AZURE_BUG_TYPE     padrão "Bug" (no processo Basic é "Issue")

export class AzureError extends Error {}

export interface WorkItem {
  id: number;
  url: string;
  title: string;
  type: string;
  areaPath?: string;
  iterationPath?: string;
}

export function azureConfig() {
  const base = process.env.AZURE_DEVOPS_URL?.replace(/\/$/, "");
  const pat = process.env.AZURE_DEVOPS_PAT;
  return base && pat ? { base, pat, apiVersion: process.env.AZURE_API_VERSION ?? "6.0", bugType: process.env.AZURE_BUG_TYPE ?? "Bug" } : null;
}

export const workItemHtmlUrl = (base: string, id: number) => `${base}/_workitems/edit/${id}`;

async function call<T>(path: string, init: { method?: string; body?: unknown; contentType?: string } = {}): Promise<T> {
  const cfg = azureConfig();
  if (!cfg) throw new AzureError("Azure DevOps não configurado: defina AZURE_DEVOPS_URL e AZURE_DEVOPS_PAT");
  const sep = path.includes("?") ? "&" : "?";
  let res: Response;
  try {
    res = await fetch(`${cfg.base}/_apis/${path}${sep}api-version=${cfg.apiVersion}`, {
      method: init.method ?? "GET",
      cache: "no-store",
      headers: {
        Authorization: `Basic ${btoa(`:${cfg.pat}`)}`,
        Accept: "application/json",
        ...(init.body !== undefined ? { "Content-Type": init.contentType ?? "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch (e) {
    throw new AzureError(`Não foi possível acessar o Azure DevOps (${cfg.base}). O servidor do QA Hub está na mesma rede? ${(e as Error).message}`);
  }
  if (res.status === 401 || res.status === 203) throw new AzureError("O Azure DevOps recusou o PAT (expirado ou sem permissão de Work Items)");
  const text = await res.text();
  if (!res.ok) {
    const message = (() => {
      try {
        return JSON.parse(text).message as string;
      } catch {
        return text.slice(0, 200);
      }
    })();
    throw new AzureError(`Azure DevOps respondeu ${res.status}: ${message}`);
  }
  return JSON.parse(text) as T;
}

interface RawWorkItem {
  id: number;
  url: string;
  fields: Record<string, string | undefined>;
}

export async function getWorkItem(id: number): Promise<WorkItem> {
  const w = await call<RawWorkItem>(`wit/workitems/${id}?fields=System.Title,System.WorkItemType,System.AreaPath,System.IterationPath`);
  return {
    id: w.id,
    url: w.url,
    title: w.fields["System.Title"] ?? "",
    type: w.fields["System.WorkItemType"] ?? "",
    areaPath: w.fields["System.AreaPath"],
    iterationPath: w.fields["System.IterationPath"],
  };
}

export interface NewBug {
  parentId: number;
  title: string;
  severity: string;
  reproHtml: string;
  foundIn: string;
  hyperlink: string;
}

/** Cria o Bug como filho do card (mesma área e sprint) e devolve id e link. */
export async function createBug(bug: NewBug): Promise<{ id: number; url: string }> {
  const cfg = azureConfig()!;
  const parent = await getWorkItem(bug.parentId);
  const add = (path: string, value: unknown) => ({ op: "add", path, value });
  const ops = [
    add("/fields/System.Title", bug.title),
    add("/fields/Microsoft.VSTS.TCM.ReproSteps", bug.reproHtml),
    add("/fields/Microsoft.VSTS.Common.Severity", bug.severity),
    add("/fields/Microsoft.VSTS.Build.FoundIn", bug.foundIn),
    ...(parent.areaPath ? [add("/fields/System.AreaPath", parent.areaPath)] : []),
    ...(parent.iterationPath ? [add("/fields/System.IterationPath", parent.iterationPath)] : []),
    add("/relations/-", { rel: "System.LinkTypes.Hierarchy-Reverse", url: parent.url, attributes: { comment: "Bug encontrado no QA Hub" } }),
    add("/relations/-", { rel: "Hyperlink", url: bug.hyperlink, attributes: { comment: "Execução no QA Hub" } }),
  ];
  const created = await call<RawWorkItem>(`wit/workitems/$${encodeURIComponent(cfg.bugType)}`, { method: "POST", body: ops, contentType: "application/json-patch+json" });
  return { id: created.id, url: workItemHtmlUrl(cfg.base, created.id) };
}

export const SEVERITIES = ["1 - Critical", "2 - High", "3 - Medium", "4 - Low"] as const;

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Monta o Repro Steps (HTML) a partir do caso e da execução. Todo texto é escapado. */
export function reproStepsHtml(p: {
  caseTitle: string;
  steps: string;
  notes: string;
  comments: string[];
  evidence: { name: string; url: string }[];
  run: string;
  build: string;
  tester: string;
  link: string;
}): string {
  const lines = (s: string) => escape(s).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
  const parts = [
    `<p><b>Caso:</b> ${escape(p.caseTitle)}</p>`,
    p.notes && `<p><b>Observações:</b><br>${lines(p.notes)}</p>`,
    p.steps && `<p><b>Passos e resultado esperado:</b><br>${lines(p.steps)}</p>`,
    p.comments.length && `<p><b>Comentários da execução:</b></p><ul>${p.comments.map((c) => `<li>${lines(c)}</li>`).join("")}</ul>`,
    p.evidence.length && `<p><b>Evidências:</b></p><ul>${p.evidence.map((e) => `<li><a href="${escape(e.url)}">${escape(e.name)}</a></li>`).join("")}</ul>`,
    `<p><b>Run:</b> ${escape(p.run)}<br><b>Build:</b> ${escape(p.build)}<br><b>Testador:</b> ${escape(p.tester)}</p>`,
    `<p><a href="${escape(p.link)}">Abrir a execução no QA Hub</a></p>`,
  ];
  return parts.filter(Boolean).join("");
}
