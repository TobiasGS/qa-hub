import "server-only";
import { randomUUID } from "node:crypto";
import type { GeneratedCase } from "./n8n";
import { sameUser } from "./visibility";

// Gerações de casos em segundo plano. A IA pode levar minutos (o Google às vezes
// responde 503 e o n8n tenta de novo), mais do que uma requisição aguenta aberta:
// o Cloudflare corta em ~100 s. A rota inicia o job e o diálogo consulta até terminar.
// Fica na memória do processo (um container só); some se o QA Hub reiniciar.

export interface GenerationJob {
  id: string;
  planId: number;
  owner: string;
  story: { key: string; title: string; type: string };
  status: "running" | "done" | "error";
  startedAt: number;
  finishedAt?: number;
  cases?: GeneratedCase[];
  error?: string;
}

/** Quanto tempo um job terminado (ou esquecido) fica disponível para consulta. */
const KEEP_MS = 30 * 60_000;

// No globalThis para sobreviver ao recarregamento de módulos do `next dev`.
const store = ((globalThis as { __qahubGenerationJobs?: Map<string, GenerationJob> }).__qahubGenerationJobs ??= new Map());

function sweep() {
  const limit = Date.now() - KEEP_MS;
  for (const [id, job] of store) if ((job.finishedAt ?? job.startedAt) < limit) store.delete(id);
}

/** Inicia o job; `work` roda solto e o resultado (ou o erro) fica guardado. */
export function startGeneration(base: Omit<GenerationJob, "id" | "status" | "startedAt">, work: () => Promise<GeneratedCase[]>): GenerationJob {
  sweep();
  const job: GenerationJob = { ...base, id: randomUUID(), status: "running", startedAt: Date.now() };
  store.set(job.id, job);
  work().then(
    (cases) => Object.assign(job, { status: "done", cases, finishedAt: Date.now() }),
    (e: Error) => Object.assign(job, { status: "error", error: e.message, finishedAt: Date.now() }),
  );
  return job;
}

/** Job do plano iniciado por esta pessoa (outra pessoa não enxerga o job de ninguém). */
export function findGeneration(id: string, planId: number, owner: string): GenerationJob | null {
  const job = store.get(id);
  return job && job.planId === planId && sameUser(job.owner, owner) ? job : null;
}
