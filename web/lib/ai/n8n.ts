import "server-only";
import { Agent, fetch as undiciFetch } from "undici";
import { ApiError } from "../api";
import { decodeEntities } from "../html";
import { parseDiagnosis, parseSpec, type CasesResult, type Diagnosis, type Flow, type GeneratedCase, type GeneratedSpec } from "./parse";

// IA pelo n8n (workflows em n8n/*.workflow.json, com Gemini). É o caminho usado enquanto não há
// ANTHROPIC_API_KEY; com a chave, o QA Hub passa a chamar o Claude direto (lib/ai/client.ts).
//   N8N_WEBHOOK_URL     ex.: http://host.docker.internal:5678/webhook/qahub-gerar-casos (no container)
//   N8N_WEBHOOK_SECRET  conferido pelo Webhook do n8n (credencial Header Auth "X-QAHub-Secret")
//   N8N_DIAGNOSE_URL / N8N_PLAYWRIGHT_URL  opcionais; sem eles, o mesmo n8n do N8N_WEBHOOK_URL

export const n8nConfigured = () => !!process.env.N8N_WEBHOOK_URL && !!process.env.N8N_WEBHOOK_SECRET;

/** Outro workflow no mesmo n8n do N8N_WEBHOOK_URL (ou no endereço do env próprio, se definido). */
function workflowUrl(override: string | undefined, path: string): string | undefined {
  if (override) return override;
  const base = process.env.N8N_WEBHOOK_URL;
  return base ? base.replace(/\/webhook\/[^/?#]+/, `/webhook/${path}`) : undefined;
}

const TIMEOUT_MS = 10 * 60_000;
// O fetch do Node desiste de esperar a resposta aos 300 s (headersTimeout do undici),
// antes do nosso limite: com a IA sobrecarregada o n8n pode levar mais que isso.
let n8nAgent: Agent | undefined;
const agent = () => (n8nAgent ??= new Agent({ headersTimeout: TIMEOUT_MS, bodyTimeout: TIMEOUT_MS }));

/** Chama um workflow do n8n (segredo no cabeçalho) e devolve o JSON da resposta, com mensagens claras. */
async function callN8n(url: string | undefined, workflow: string, payload: unknown): Promise<unknown> {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!url || !secret) throw new ApiError("IA não configurada: defina ANTHROPIC_API_KEY (Claude) ou N8N_WEBHOOK_URL e N8N_WEBHOOK_SECRET (n8n).");

  let res: Awaited<ReturnType<typeof undiciFetch>>;
  try {
    res = await undiciFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-QAHub-Secret": secret },
      body: JSON.stringify(payload),
      dispatcher: agent(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const err = e as Error;
    if (err.name === "TimeoutError" || /UND_ERR_(HEADERS|BODY)_TIMEOUT/.test(String((err as { cause?: { code?: string } }).cause?.code))) throw new ApiError(`O n8n não respondeu em ${TIMEOUT_MS / 60_000} minutos. A IA pode estar sobrecarregada: tente de novo mais tarde.`, 504);
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

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const PRIORITIES = ["alta", "média", "baixa"] as const;
/** O workflow do n8n usa positivo/negativo/borda; no QA Hub isso vira principal/exceção/borda. */
const FLOW_OF: Record<string, Flow> = { positivo: "principal", negativo: "exceção", borda: "borda" };

/** Resposta do workflow de casos (sem análise da história) no formato novo do QA Hub. */
export function casesFromN8n(data: unknown): GeneratedCase[] {
  const raw = (data as { cases?: unknown })?.cases ?? (Array.isArray(data) ? (data[0] as { cases?: unknown })?.cases : undefined);
  if (!Array.isArray(raw)) throw new ApiError("O n8n respondeu num formato inesperado (falta a lista \"cases\")", 502);
  return (raw as Record<string, unknown>[])
    .map((c) => {
      const gherkin = decodeEntities(String(c.gherkin ?? c.steps ?? "")).trim();
      return {
        title: decodeEntities(String(c.title ?? "")).trim().slice(0, 255),
        priority: PRIORITIES.find((p) => norm(p) === norm(c.priority)) ?? "média",
        flow: FLOW_OF[norm(c.kind)] ?? "principal",
        text: gherkin,
      };
    })
    .filter((c) => c.title && c.text)
    .slice(0, 20);
}

export async function generateCasesViaN8n(payload: { story: { key: string; title: string; description: string; acceptanceCriteria: string }; existingCases: string[] }): Promise<CasesResult> {
  const data = await callN8n(process.env.N8N_WEBHOOK_URL, "QA Hub · Gerar casos da história", { ...payload, format: "gherkin", language: "pt-BR" });
  const cases = casesFromN8n(data);
  if (!cases.length) throw new ApiError("O n8n não devolveu nenhum caso aproveitável. Tente de novo ou revise a história no Azure.", 502);
  return { cases, analysis: null };
}

export async function diagnoseViaN8n(payload: unknown, executionIds: number[]): Promise<Diagnosis> {
  const url = workflowUrl(process.env.N8N_DIAGNOSE_URL, "qahub-diagnosticar-falhas");
  return parseDiagnosis(await callN8n(url, "QA Hub · Diagnosticar falhas", payload), executionIds);
}

export async function generatePlaywrightViaN8n(payload: unknown, caseId: number): Promise<GeneratedSpec> {
  const url = workflowUrl(process.env.N8N_PLAYWRIGHT_URL, "qahub-gerar-playwright");
  return parseSpec(await callN8n(url, "QA Hub · Gerar teste Playwright", { ...(payload as object), language: "pt-BR" }), caseId);
}
