import "server-only";
import { azureConfig, getStory } from "./azure";
import { decodeEntitiesOnce } from "./html";
import { notify } from "./notify";
import { failureSignals, SIGNAL_LABEL, type FailureSignal } from "./diagnosis";
import { latestJob, startJob, type Job } from "./jobs";
import type { KiwiApi, TestRun } from "./kiwi/types";
import { diagnoseUrl, diagnoseViaN8n, type Diagnosis } from "./n8n";
import { planCardId } from "./plan-task";
import { isTimerComment } from "./timer";

// Diagnóstico das falhas de um run pela IA (n8n), guardado no campo `notes` do run
// no Kiwi, num bloco marcado: uma nova análise troca só esse bloco e preserva o
// que alguém escreveu à mão nas notas.

export interface SavedDiagnosis extends Diagnosis {
  at: string;
  by: string;
}

export type DiagnosisJob = Job<SavedDiagnosis, null>;

const OPEN = "<!-- qahub-diagnostico ";
const CLOSE = "<!-- /qahub-diagnostico -->";
const BLOCK = /<!-- qahub-diagnostico ([\s\S]*?) -->[\s\S]*?<!-- \/qahub-diagnostico -->\n?/;
const MAX_FAILURES = 30;
const MAX_TEXT = 1500;

/**
 * A API do Kiwi devolve as notas com HTML escapado (`&lt;!--`, `&quot;`), embora guarde
 * o texto original. Desfaz isso antes de ler ou regravar (senão o bloco não é achado,
 * duplica e o resto das notas vai sendo escapado de novo a cada análise).
 */
export const unescapeKiwi = (text: string | null | undefined) => decodeEntitiesOnce(text ?? "");

export const aiConfigured = () => !!diagnoseUrl() && !!process.env.N8N_WEBHOOK_SECRET;

export function readDiagnosis(notes: string | null | undefined): SavedDiagnosis | null {
  const m = unescapeKiwi(notes).match(BLOCK);
  if (!m) return null;
  try {
    return JSON.parse(m[1]) as SavedDiagnosis;
  } catch {
    return null;
  }
}

/** Notas com o bloco do diagnóstico trocado (JSON para o QA Hub + texto para quem abre no Kiwi). */
export function writeDiagnosis(notes: string | null | undefined, d: SavedDiagnosis): string {
  // "--" fecharia o comentário HTML: dentro das strings do JSON vira "--".
  const json = JSON.stringify(d).replace(/--/g, "-\\u002d");
  const text = [
    `Diagnóstico de falhas (QA Hub, ${d.at.slice(0, 16).replace("T", " ")} UTC)`,
    d.summary,
    ...d.groups.map((g) => `- ${g.title} [${g.category}, confiança ${g.confidence}]: ${g.action}`),
  ]
    .filter(Boolean)
    .join("\n");
  const block = `${OPEN}${json} -->\n${text}\n${CLOSE}\n`;
  const rest = unescapeKiwi(notes).replace(BLOCK, "");
  return rest.trim() ? `${block}\n${rest.trim()}\n` : block;
}

const cut = (s: string | null | undefined, max = MAX_TEXT) => (s ?? "").trim().slice(0, max);

/** O que vai para a IA: só texto (passos, comentários, bugs, sinais), com limites. */
async function payloadFor(kiwi: KiwiApi, run: TestRun, signals: FailureSignal[]) {
  const failures = signals.slice(0, MAX_FAILURES);
  const ids = failures.map((f) => f.executionId);
  const [[plan], cases, links, comments] = await Promise.all([
    kiwi.plans({ id: run.plan }),
    kiwi.cases({ id__in: [...new Set(failures.map((f) => f.caseId))] }),
    kiwi.links({ execution__in: ids, is_defect: true }),
    Promise.all(failures.map((f) => kiwi.comments(f.executionId))),
  ]);
  const cardId = plan ? planCardId(plan) : null;
  const story = cardId && azureConfig() ? await getStory(cardId).catch(() => null) : null;
  return {
    language: "pt-BR",
    run: { id: run.id, title: run.summary, build: run.build__name, plan: run.plan__name },
    story: story ? { key: `azure-${cardId}`, title: story.title, description: cut(story.description, 3000), acceptanceCriteria: cut(story.acceptanceCriteria, 3000) } : null,
    failures: failures.map((f, i) => ({
      execution: f.executionId,
      case: f.caseId,
      title: f.summary,
      outcome: f.outcome === "blocked" ? "bloqueado" : "falhou",
      steps: cut(cases.find((c) => c.id === f.caseId)?.text),
      comments: cut(
        comments[i]
          .filter((c) => !isTimerComment(c.comment))
          .map((c) => c.comment)
          .join("\n---\n"),
      ),
      bugs: links.filter((l) => l.execution === f.executionId).map((l) => l.name || l.url),
      signals: f.tags.map((t) => SIGNAL_LABEL[t]),
      lastPassBuild: f.lastPassBuild,
      failedInLast5: `${f.failRate.failed}/${f.failRate.total}`,
    })),
  };
}

/**
 * Inicia o diagnóstico em segundo plano (ou devolve o que já está rodando para este run).
 * Ao terminar, grava no run. Erros ficam no job e no log.
 */
export async function startDiagnosis(kiwi: KiwiApi, run: TestRun, owner: string): Promise<DiagnosisJob | null> {
  const running = latestJob<SavedDiagnosis, null>("diagnosis", run.id);
  if (running?.status === "running") return running;
  const signals = await failureSignals(kiwi, run);
  if (!signals.length) return null;
  return startJob({ kind: "diagnosis", scope: run.id, owner, meta: null }, async () => {
    const diagnosis = await diagnoseViaN8n(await payloadFor(kiwi, run, signals), signals.map((s) => s.executionId));
    const saved: SavedDiagnosis = { ...diagnosis, at: new Date().toISOString(), by: owner };
    // Relê as notas na hora de gravar: alguém pode ter mexido nelas durante a análise.
    const [current] = await kiwi.runs({ id: run.id });
    await kiwi.updateRun(run.id, { notes: writeDiagnosis(current?.notes, saved) });
    notify({
      type: "diagnostico_pronto",
      run: { id: run.id, title: run.summary, plan: run.plan__name, build: run.build__name },
      summary: saved.summary,
      causes: saved.groups.slice(0, 3).map((g) => ({ title: g.title, cases: g.executions.length, action: g.action })),
    });
    return saved;
  });
}

/** Run concluído com falhas: dispara o diagnóstico sem atrasar quem registrou o resultado. */
export function autoDiagnose(kiwi: KiwiApi, run: TestRun, owner: string) {
  if (!aiConfigured()) return;
  startDiagnosis(kiwi, run, owner).catch((e) => console.error(`[diagnóstico] run ${run.id}:`, (e as Error).message));
}
