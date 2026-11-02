import "server-only";
import { ApiError } from "./api";

// Geração de casos de teste pela história, num workflow do n8n (n8n/qahub-gerar-casos.workflow.json).
//   N8N_WEBHOOK_URL     ex.: http://host.docker.internal:5678/webhook/qahub-gerar-casos (no container)
//   N8N_WEBHOOK_SECRET  conferido pelo Webhook do n8n (credencial Header Auth "X-QAHub-Secret")

export interface StoryPayload {
  story: { key: string; title: string; description: string; acceptanceCriteria: string };
  format: "gherkin";
  language: "pt-BR";
  existingCases: string[];
}

export interface GeneratedCase {
  title: string;
  priority: "alta" | "média" | "baixa";
  kind: "positivo" | "negativo" | "borda";
  gherkin: string;
}

const TIMEOUT_MS = 10 * 60_000;
const PRIORITIES =["alta", "média", "baixa"] as const;
const KINDS = ["positivo", "negativo", "borda"] as const;
const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Valida e normaliza a resposta do n8n (o modelo de IA pode variar o formato). */
export function parseGeneratedCases(data: unknown): GeneratedCase[] {
  const raw = (data as { cases?: unknown })?.cases ?? (Array.isArray(data) ? (data[0] as { cases?: unknown })?.cases : undefined);
  if (!Array.isArray(raw)) throw new ApiError("O n8n respondeu num formato inesperado (falta a lista \"cases\")", 502);
  const cases = raw
    .map((c: Record<string, unknown>) => ({
      title: String(c.title ?? "").trim().slice(0, 255),
      priority: PRIORITIES.find((p) => norm(p) === norm(c.priority)) ?? "média",
      kind: KINDS.find((k) => norm(k) === norm(c.kind)) ?? "positivo",
      gherkin: String(c.gherkin ?? c.steps ?? "").trim(),
    }))
    .filter((c) => c.title && c.gherkin)
    .slice(0, 20);
  if (!cases.length) throw new ApiError("O n8n não devolveu nenhum caso aproveitável. Tente de novo ou revise a história no Azure.", 502);
  return cases;
}

/** Outro workflow no mesmo n8n do N8N_WEBHOOK_URL (ou no endereço do env próprio, se definido). */
function workflowUrl(override: string | undefined, path: string): string | undefined {
  if (override) return override;
  const base = process.env.N8N_WEBHOOK_URL;
  return base ? base.replace(/\/webhook\/[^/?#]+/, `/webhook/${path}`) : undefined;
}

/** Webhook do diagnóstico: N8N_DIAGNOSE_URL ou, sem ele, o mesmo n8n do N8N_WEBHOOK_URL. */
export const diagnoseUrl = () => workflowUrl(process.env.N8N_DIAGNOSE_URL, "qahub-diagnosticar-falhas");

/** Chama um workflow do n8n (segredo no cabeçalho) e devolve o JSON da resposta, com mensagens claras. */
async function callN8n(url: string | undefined, workflow: string, payload: unknown): Promise<unknown> {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!url || !secret) throw new ApiError("IA não configurada: defina N8N_WEBHOOK_URL e N8N_WEBHOOK_SECRET.");

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-QAHub-Secret": secret },
      body: JSON.stringify(payload),
      cache: "no-store",
      // Roda em segundo plano (lib/jobs.ts): com a IA sobrecarregada, as
      // novas tentativas do workflow podem passar de 5 minutos.
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const err = e as Error;
    if (err.name === "TimeoutError") throw new ApiError(`O n8n não respondeu em ${TIMEOUT_MS / 60_000} minutos. A IA pode estar sobrecarregada: tente de novo mais tarde.`, 504);
    throw new ApiError("Não consegui falar com o n8n. Ele está ligado? Rode o \"Iniciar QA Hub.cmd\" ou abra o n8n.", 502);
  }
  if (res.status === 401 || res.status === 403) throw new ApiError("O n8n recusou o acesso: o segredo do webhook não confere (N8N_WEBHOOK_SECRET × credencial Header Auth).", 502);
  if (res.status === 404) throw new ApiError(`Webhook não encontrado no n8n: importe e PUBLIQUE o workflow "${workflow}".`, 502);
  const text = await res.text();
  if (res.status === 500) throw new ApiError("O workflow do n8n falhou, em geral porque a IA está indisponível ou sobrecarregada. Tente de novo em alguns minutos; o detalhe fica em Executions, no n8n.", 502);
  if (!res.ok) throw new ApiError(`O n8n respondeu ${res.status}: ${text.slice(0, 200)}`, 502);
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("O n8n não devolveu JSON. Confira o nó \"Respond to Webhook\" do workflow.", 502);
  }
}

export async function generateCasesViaN8n(payload: StoryPayload): Promise<GeneratedCase[]> {
  return parseGeneratedCases(await callN8n(process.env.N8N_WEBHOOK_URL, "QA Hub · Gerar casos da história", payload));
}

// ---- Diagnóstico de falhas (n8n/qahub-diagnosticar-falhas.workflow.json) ----

export const DIAGNOSIS_CATEGORIES = ["produto", "ambiente", "dados", "caso_desatualizado", "instavel"] as const;
export const CONFIDENCES = ["alta", "média", "baixa"] as const;

export interface DiagnosisGroup {
  title: string;
  category: (typeof DIAGNOSIS_CATEGORIES)[number];
  confidence: (typeof CONFIDENCES)[number];
  executions: number[];
  evidence: string;
  action: string;
}

export interface Diagnosis {
  summary: string;
  groups: DiagnosisGroup[];
}

const cut = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

/** Valida a resposta da IA: só execuções do run, categorias e confianças conhecidas, textos limitados. */
export function parseDiagnosis(data: unknown, executionIds: number[]): Diagnosis {
  const d = (Array.isArray(data) ? data[0] : data) as { summary?: unknown; groups?: unknown };
  if (!d || !Array.isArray(d.groups)) throw new ApiError("O n8n respondeu num formato inesperado (falta a lista \"groups\")", 502);
  const known = new Set(executionIds);
  const groups = (d.groups as Record<string, unknown>[])
    .map((g) => ({
      title: cut(g.title, 160),
      category: DIAGNOSIS_CATEGORIES.find((c) => norm(c) === norm(g.category)) ?? "produto",
      confidence: CONFIDENCES.find((c) => norm(c) === norm(g.confidence)) ?? "baixa",
      executions: (Array.isArray(g.executions) ? g.executions : []).map(Number).filter((id) => known.has(id)),
      evidence: cut(g.evidence, 800),
      action: cut(g.action, 400),
    }))
    .filter((g) => g.title && g.executions.length)
    .slice(0, 12);
  if (!groups.length) throw new ApiError("A IA não devolveu nenhum grupo de falhas aproveitável. Tente de novo.", 502);
  return { summary: cut(d.summary, 600), groups };
}

export async function diagnoseViaN8n(payload: unknown, executionIds: number[]): Promise<Diagnosis> {
  return parseDiagnosis(await callN8n(diagnoseUrl(), "QA Hub · Diagnosticar falhas", payload), executionIds);
}

// ---- Teste Playwright a partir do caso (n8n/qahub-gerar-playwright.workflow.json) ----

export interface PlaywrightPayload {
  case: { id: number; title: string; steps: string; requirement: string | null };
  plan: { id: number; name: string; hints: string };
  language: "pt-BR";
}

export interface GeneratedSpec {
  filename: string;
  code: string;
}

export function parseSpec(data: unknown, caseId: number): GeneratedSpec {
  const d = (Array.isArray(data) ? data[0] : data) as { filename?: unknown; code?: unknown };
  let code = String(d?.code ?? "").trim();
  if (!code.includes("test(")) throw new ApiError("A IA não devolveu um teste Playwright aproveitável. Tente de novo.", 502);
  // O título precisa do TC-id para o resultado cair no caso certo.
  if (!code.includes(`[TC-${caseId}]`)) code = code.replace(/test\((["'`])/, `test($1[TC-${caseId}] `);
  const slug = String(d?.filename ?? "").replace(/[^a-z0-9.-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
  const filename = /\.spec\.ts$/.test(slug) ? slug : `tc-${caseId}.spec.ts`;
  return { filename: filename.startsWith(`tc-${caseId}`) ? filename : `tc-${caseId}-${filename}`, code: code.slice(0, 20_000) };
}

export async function generatePlaywrightViaN8n(payload: PlaywrightPayload): Promise<GeneratedSpec> {
  const url = workflowUrl(process.env.N8N_PLAYWRIGHT_URL, "qahub-gerar-playwright");
  return parseSpec(await callN8n(url, "QA Hub · Gerar teste Playwright", payload), payload.case.id);
}
