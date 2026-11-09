// Normalização das respostas da IA para o formato do QA Hub (limpa, limita e completa campos).
// Sem dependência do SDK: os tipos aqui também são usados pelo navegador (diálogo de casos).

import { ApiError } from "../api";
import { decodeEntities } from "../html";

const clean = (v: unknown, max = 4000) => decodeEntities(String(v ?? "")).trim().slice(0, max);
const cut = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// ---- Casos da história ----

export const FLOWS = ["principal", "alternativo", "exceção", "borda"] as const;
export const IMPACT_LEVELS = ["alto", "médio", "baixo"] as const;
export type Flow = (typeof FLOWS)[number];
export type ImpactLevel = (typeof IMPACT_LEVELS)[number];

export interface GeneratedCase {
  title: string;
  priority: "alta" | "média" | "baixa";
  flow: Flow;
  /** Texto do caso no Kiwi (Markdown): resumo, pré-condições, dados, Gherkin, resultado esperado e impacto. */
  text: string;
}

export interface StoryAnalysis {
  summary: string;
  stories: string[];
  points: { type: string; text: string }[];
  nonFunctional: { security: string[]; performance: string[]; usability: string[] };
  impact: { level: ImpactLevel; reason: string };
}

export interface CasesResult {
  cases: GeneratedCase[];
  /** Só com o Claude; o workflow do n8n não faz a análise da história. */
  analysis: StoryAnalysis | null;
}

interface RawCase {
  title?: unknown;
  flow?: unknown;
  priority?: unknown;
  summary?: unknown;
  preconditions?: unknown;
  testData?: unknown;
  gherkin?: unknown;
  expected?: unknown;
  impact?: unknown;
  impactReason?: unknown;
}

const PRIORITIES = ["alta", "média", "baixa"] as const;
const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => list.find((x) => norm(x) === norm(v)) ?? fallback;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Monta o texto do caso como a tela de execução mostra: campos em negrito e o Gherkin no meio. */
export function buildCaseText(c: { summary: string; preconditions: string; testData: string; gherkin: string; expected: string; impact: ImpactLevel; impactReason: string }): string {
  const parts = [
    c.summary && `**Resumo:** ${c.summary}`,
    c.preconditions && `**Pré-condições:** ${c.preconditions}`,
    c.testData && `**Dados de teste:** ${c.testData}`,
    c.gherkin,
    c.expected && `**Resultado esperado:** ${c.expected}`,
    `**Impacto:** ${capitalize(c.impact)}${c.impactReason ? ` — ${c.impactReason}` : ""}`,
  ];
  return parts.filter(Boolean).join("\n\n");
}

export function normalizeCases(raw: unknown): GeneratedCase[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RawCase[])
    .filter((c) => clean(c.title) && clean(c.gherkin))
    .map((c) => {
      const gherkin = clean(c.gherkin, 8000);
      return {
        title: clean(c.title, 255),
        priority: pick(PRIORITIES, c.priority, "média"),
        flow: pick(FLOWS, c.flow, "principal"),
        text: buildCaseText({
          summary: clean(c.summary, 1000),
          preconditions: clean(c.preconditions, 1000),
          testData: clean(c.testData, 1000),
          gherkin,
          expected: clean(c.expected, 1000),
          impact: pick(IMPACT_LEVELS, c.impact, "médio"),
          impactReason: clean(c.impactReason, 500),
        }),
      };
    })
    .slice(0, 20);
}

const list = (v: unknown, max = 20) => (Array.isArray(v) ? v.map((x) => clean(x, 600)).filter(Boolean).slice(0, max) : []);

export function normalizeAnalysis(raw: unknown): StoryAnalysis {
  const a = (raw ?? {}) as Record<string, unknown>;
  const nf = (a.nonFunctional ?? {}) as Record<string, unknown>;
  const impact = (a.impact ?? {}) as Record<string, unknown>;
  return {
    summary: clean(a.summary, 1200),
    stories: list(a.stories),
    points: (Array.isArray(a.points) ? a.points : [])
      .map((p: { type?: unknown; text?: unknown }) => ({ type: clean(p?.type, 40), text: clean(p?.text, 800) }))
      .filter((p) => p.text)
      .slice(0, 30),
    nonFunctional: { security: list(nf.security, 10), performance: list(nf.performance, 10), usability: list(nf.usability, 10) },
    impact: { level: pick(IMPACT_LEVELS, impact.level, "médio"), reason: clean(impact.reason, 1000) },
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ul = (items: string[]) => (items.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "");

/** Análise em HTML para o comentário no card do Azure. */
export function analysisHtml(a: StoryAnalysis, by: string): string {
  return [
    `<p><b>Análise de qualidade da história (QA Hub · IA)</b> — gerada por ${esc(by)}. Revise antes de agir.</p>`,
    a.summary && `<p>${esc(a.summary)}</p>`,
    a.points.length && `<p><b>Pontos de atenção</b></p>${ul(a.points.map((p) => `[${p.type}] ${p.text}`))}`,
    `<p><b>Impacto:</b> ${esc(capitalize(a.impact.level))}${a.impact.reason ? ` — ${esc(a.impact.reason)}` : ""}</p>`,
    a.nonFunctional.security.length && `<p><b>Segurança</b></p>${ul(a.nonFunctional.security)}`,
    a.nonFunctional.performance.length && `<p><b>Performance</b></p>${ul(a.nonFunctional.performance)}`,
    a.nonFunctional.usability.length && `<p><b>Usabilidade</b></p>${ul(a.nonFunctional.usability)}`,
  ]
    .filter(Boolean)
    .join("");
}

// ---- Diagnóstico de falhas ----

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

/** Valida a resposta da IA: só execuções do run, categorias e confianças conhecidas, textos limitados. */
export function parseDiagnosis(data: unknown, executionIds: number[]): Diagnosis {
  const d = (Array.isArray(data) ? data[0] : data) as { summary?: unknown; groups?: unknown };
  if (!d || !Array.isArray(d.groups)) throw new ApiError("A IA respondeu num formato inesperado (falta a lista \"groups\")", 502);
  const known = new Set(executionIds);
  const groups = (d.groups as Record<string, unknown>[])
    .map((g) => ({
      title: cut(g.title, 160),
      category: pick(DIAGNOSIS_CATEGORIES, g.category, "produto"),
      confidence: pick(CONFIDENCES, g.confidence, "baixa"),
      executions: (Array.isArray(g.executions) ? g.executions : []).map(Number).filter((id) => known.has(id)),
      evidence: cut(g.evidence, 800),
      action: cut(g.action, 400),
    }))
    .filter((g) => g.title && g.executions.length)
    .slice(0, 12);
  if (!groups.length) throw new ApiError("A IA não devolveu nenhum grupo de falhas aproveitável. Tente de novo.", 502);
  return { summary: cut(d.summary, 600), groups };
}

// ---- Teste Playwright ----

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
  return { filename: filename.startsWith(`tc-${caseId}`) ? filename : `tc-${caseId}-${filename}`, code: code.slice(0, 20_000) + "\n" };
}
