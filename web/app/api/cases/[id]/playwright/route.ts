import { ApiError, apiRoute, readJson, toId } from "@/lib/api";
import { getAutomation } from "@/lib/automation-config";
import { findJob, startJob, type Job } from "@/lib/jobs";
import { generatePlaywright } from "@/lib/ai/playwright";
import type { GeneratedSpec } from "@/lib/ai/parse";
import { requireCaseEditable } from "@/lib/visibility";

type SpecJob = Job<GeneratedSpec, { caseId: number; folder: string | null }>;

const view = (job: SpecJob) => ({
  job: job.id,
  status: job.status,
  elapsed: Math.round(((job.finishedAt ?? Date.now()) - job.startedAt) / 1000),
  folder: job.meta.folder,
  ...(job.status === "done" ? { spec: job.result } : {}),
  ...(job.status === "error" ? { error: job.error } : {}),
});

/** Dicas de seletores do plano: a seção "## Automação" da descrição do plano, se houver. */
const hintsOf = (text: string | null | undefined) => (text ?? "").match(/##\s*Automa[çc][ãa]o\s*\n([\s\S]*?)(?:\n##\s|$)/i)?.[1]?.trim().slice(0, 3000) ?? "";

/**
 * "Gerar teste Playwright": a IA (API do Claude) escreve um *.spec.ts a partir dos passos
 * Dado/Quando/Então do caso, com o TC-id no título. Corpo: { plan }. Nada é salvo:
 * a pessoa copia ou baixa o arquivo para o repositório de testes.
 */
export const POST = apiRoute<{ id: string }>(async ({ kiwi, viewer }, req, { id }) => {
  const testCase = await requireCaseEditable(kiwi, viewer, toId(id));
  const raw = await readJson(req);
  const [plan] = raw.plan ? await kiwi.plans({ id: toId(raw.plan, "plano") }) : [];
  if (!testCase.text?.trim()) throw new ApiError("O caso não tem passos para virar teste. Escreva o Dado/Quando/Então primeiro.");
  // Sistema do projeto (Projetos → Configurar automação): pasta dos testes e URL viram dicas para a IA.
  const auto = plan ? await getAutomation(plan.product) : null;
  const system = auto ? `Sistema em teste: ${auto.baseUrl} (o login já está feito pela sessão salva). Arquivo em tests/${auto.folder}/. Importe test, expect e passo de "../fixtures" e use passo("Dado …") em cada passo do Gherkin.` : "";
  const job = startJob({ kind: "playwright", scope: testCase.id, owner: viewer.username, meta: { caseId: testCase.id, folder: auto?.folder ?? null } }, () =>
    generatePlaywright({
      case: { id: testCase.id, title: testCase.summary, steps: (testCase.text ?? "").slice(0, 6000), requirement: testCase.requirement },
      plan: { id: plan?.id ?? 0, name: plan?.name ?? "", hints: [system, hintsOf(plan?.text)].filter(Boolean).join("\n\n") },
    }),
  );
  return view(job);
});

/** Andamento: ?job=<id>. */
export const GET = apiRoute<{ id: string }>(async ({ kiwi, viewer }, req, { id }) => {
  const testCase = await requireCaseEditable(kiwi, viewer, toId(id));
  const job = findJob<GeneratedSpec, SpecJob["meta"]>("playwright", new URL(req.url).searchParams.get("job") ?? "", testCase.id, viewer.username);
  if (!job) throw new ApiError("Geração não encontrada (o QA Hub pode ter reiniciado). Clique em Gerar de novo.", 404);
  return view(job);
});
