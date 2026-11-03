import "server-only";
import { ApiError } from "./api";
import type { KiwiApi, TestRun } from "./kiwi/types";
import { autoDiagnose } from "./run-diagnosis";
import { markRunStarted, syncRunState } from "./run-state";
import { kiwiDate } from "./timer";

// Resultados de testes automatizados (Playwright no pipeline) gravados no caso certo:
// cada teste traz o id do caso no título, "[TC-12] Login válido". O pipeline de uma
// build vira (ou reaproveita) o run "<plano> — build <n> · automatizado".

export interface AutomationResult {
  title: string;
  status: "passed" | "failed" | "skipped" | "timedOut" | "interrupted";
  durationMs?: number;
  error?: string;
}

export interface AutomationPayload {
  plan: number;
  build: string;
  pipelineUrl?: string;
  results: AutomationResult[];
}

const TC = /\[TC-(\d+)\]/i;
const MAX_RESULTS = 500;
const AUTO_SUFFIX = " · automatizado";

/** Valida o corpo enviado pelo reporter. */
export function parsePayload(raw: unknown): AutomationPayload {
  const b = raw as Partial<AutomationPayload> | null;
  const plan = Number(b?.plan);
  const build = String(b?.build ?? "").trim().slice(0, 255);
  if (!Number.isInteger(plan) || plan <= 0) throw new ApiError("Campo inválido: plan (id do plano no QA Hub)");
  if (!build) throw new ApiError("Campo inválido: build");
  if (!Array.isArray(b?.results) || !b.results.length) throw new ApiError("Nenhum resultado em results");
  if (b.results.length > MAX_RESULTS) throw new ApiError(`Mais de ${MAX_RESULTS} resultados num envio`);
  const results = b.results.map((r) => ({
    title: String(r?.title ?? "").slice(0, 500),
    status: (["passed", "failed", "skipped", "timedOut", "interrupted"].includes(r?.status) ? r.status : "failed") as AutomationResult["status"],
    durationMs: Math.max(0, Math.min(12 * 3600_000, Number(r?.durationMs) || 0)),
    error: r?.error ? String(r.error).slice(0, 4000) : undefined,
  }));
  const pipelineUrl = typeof b?.pipelineUrl === "string" && /^https?:\/\//.test(b.pipelineUrl) ? b.pipelineUrl.slice(0, 1000) : undefined;
  return { plan, build, pipelineUrl, results };
}

/** Tira as cores ANSI do terminal e corta mensagens de erro longas. */
const cleanError = (e: string) => e.replace(/\u001b\[[0-9;]*m/g, "").trim().slice(0, 1500);

export async function applyResults(kiwi: KiwiApi, p: AutomationPayload, ciUsername: string, hubOrigin: string) {
  const [[plan], statuses, [me]] = await Promise.all([kiwi.plans({ id: p.plan }), kiwi.statuses(), kiwi.users({ username: ciUsername })]);
  if (!plan) throw new ApiError(`Plano ${p.plan} não encontrado no QA Hub`, 404);
  const planCases = new Set((await kiwi.cases({ plan: plan.id })).map((c) => c.id));

  // Separa o que tem TC-id do plano; o resto volta em `ignored` para o log do pipeline.
  const ignored: { title: string; reason: string }[] = [];
  const byCase = new Map<number, AutomationResult>();
  for (const r of p.results) {
    const id = Number(r.title.match(TC)?.[1]);
    // Pulado no Playwright (test.skip/test.fixme): não entra no run, senão ele nunca seria concluído.
    if (r.status === "skipped") ignored.push({ title: r.title, reason: "pulado no Playwright (skip/fixme)" });
    else if (!id) ignored.push({ title: r.title, reason: "sem [TC-id] no título" });
    else if (!planCases.has(id)) ignored.push({ title: r.title, reason: `TC-${id} não está no plano ${plan.id}` });
    // Mais de um teste para o mesmo caso: vale o pior resultado.
    else if (!byCase.has(id) || r.status !== "passed") byCase.set(id, r);
  }
  if (!byCase.size) return { run: null, url: null, applied: 0, ignored };

  // Build (do projeto) e run automatizado desta build: reaproveitado se o pipeline rodar de novo.
  const builds = await kiwi.builds({ version: plan.product_version });
  const build = builds.find((b) => b.name.toLowerCase() === p.build.toLowerCase()) ?? (await kiwi.createBuild({ name: p.build, version: plan.product_version }));
  const summary = `${plan.name} — build ${build.name}${AUTO_SUFFIX}`.slice(0, 255);
  let run: TestRun | undefined = (await kiwi.runs({ plan: plan.id, build: build.id })).find((r) => r.summary.endsWith(AUTO_SUFFIX));
  if (!run) {
    run = await kiwi.createRun({ plan: plan.id, build: build.id, summary, manager: me?.id ?? 0, default_tester: me?.id ?? null });
    await markRunStarted(kiwi, plan.id); // tarefa do plano no Azure → "Em Teste"
  } else if (run.stop_date) {
    // Pipeline rodou de novo nesta build: reabre, para concluir com o resultado novo
    // (a tarefa no Azure e o diagnóstico acompanham a nova rodada).
    await kiwi.updateRun(run.id, { stop_date: null });
    await markRunStarted(kiwi, plan.id);
  }

  const status = (name: string) => statuses.find((s) => s.name === name)?.id;
  const existing = await kiwi.executions({ run: run.id });
  const now = Date.now();
  for (const [caseId, r] of byCase) {
    const execution = existing.find((e) => e.case === caseId) ?? (await kiwi.addCaseToRun(run.id, caseId));
    const target = r.status === "passed" ? status("PASSED") : status("FAILED");
    if (target === undefined) continue;
    await kiwi.updateExecution(execution.id, { status: target, start_date: kiwiDate(new Date(now - (r.durationMs ?? 0))), stop_date: kiwiDate(new Date(now)) });
    if (r.status !== "passed") {
      const lines = [`🤖 Teste automatizado ${r.status === "timedOut" ? "estourou o tempo" : "falhou"}: ${r.title}`];
      if (r.error) lines.push("", cleanError(r.error));
      if (p.pipelineUrl) lines.push("", `Pipeline: ${p.pipelineUrl}`);
      await kiwi.addComment(execution.id, lines.join("\n"));
    }
  }

  // Concluído? Move a tarefa do plano no Azure e, com falhas, a IA diagnostica.
  const state = await syncRunState(kiwi, run.id);
  if (state === "closed") {
    const [closed] = await kiwi.runs({ id: run.id });
    if (closed) autoDiagnose(kiwi, closed, ciUsername);
  }
  return { run: run.id, url: `${hubOrigin}/runs/${run.id}`, applied: byCase.size, state, ignored };
}
