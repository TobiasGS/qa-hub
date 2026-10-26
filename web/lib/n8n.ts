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

const PRIORITIES = ["alta", "média", "baixa"] as const;
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

export async function generateCasesViaN8n(payload: StoryPayload): Promise<GeneratedCase[]> {
  const url = process.env.N8N_WEBHOOK_URL;
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!url || !secret) throw new ApiError("Geração por IA não configurada: defina N8N_WEBHOOK_URL e N8N_WEBHOOK_SECRET.");

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-QAHub-Secret": secret },
      body: JSON.stringify(payload),
      cache: "no-store",
      // Modelos de raciocínio (ex.: DeepSeek R1) podem levar mais de um minuto.
      signal: AbortSignal.timeout(150_000),
    });
  } catch (e) {
    const err = e as Error;
    if (err.name === "TimeoutError") throw new ApiError("O n8n demorou demais para responder (mais de 2,5 min). Tente de novo ou use um modelo mais rápido no workflow.", 504);
    throw new ApiError("Não consegui falar com o n8n. Ele está ligado? Rode o \"Iniciar QA Hub.cmd\" ou abra o n8n.", 502);
  }
  if (res.status === 401 || res.status === 403) throw new ApiError("O n8n recusou o acesso: o segredo do webhook não confere (N8N_WEBHOOK_SECRET × credencial Header Auth).", 502);
  if (res.status === 404) throw new ApiError("Webhook não encontrado no n8n: importe e ATIVE o workflow \"QA Hub · Gerar casos da história\".", 502);
  const text = await res.text();
  if (!res.ok) throw new ApiError(`O n8n respondeu ${res.status}: ${text.slice(0, 200)}`, 502);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ApiError("O n8n não devolveu JSON. Confira o nó \"Respond to Webhook\" do workflow.", 502);
  }
  return parseGeneratedCases(data);
}
