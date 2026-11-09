import "server-only";
import { randomUUID } from "node:crypto";
import { sameUser } from "./visibility";

// Trabalhos de IA em segundo plano (gerar casos, diagnosticar falhas). A IA pode levar
// minutos (respostas longas, novas tentativas quando a API está sobrecarregada), mais do que uma
// requisição aguenta aberta: o Cloudflare corta em ~100 s. A rota inicia o job e a
// tela consulta até terminar. Fica na memória do processo (um container só); some se
// o QA Hub reiniciar.

export type JobKind = "cases" | "diagnosis" | "playwright";

export interface Job<T, M = unknown> {
  id: string;
  kind: JobKind;
  /** Plano (casos) ou run (diagnóstico) a que o job pertence. */
  scope: number;
  owner: string;
  meta: M;
  status: "running" | "done" | "error";
  startedAt: number;
  finishedAt?: number;
  result?: T;
  error?: string;
}

/** Quanto tempo um job terminado (ou esquecido) fica disponível para consulta. */
const KEEP_MS = 30 * 60_000;

// No globalThis para sobreviver ao recarregamento de módulos do `next dev`.
const store = ((globalThis as { __qahubJobs?: Map<string, Job<unknown>> }).__qahubJobs ??= new Map());

function sweep() {
  const limit = Date.now() - KEEP_MS;
  for (const [id, job] of store) if ((job.finishedAt ?? job.startedAt) < limit) store.delete(id);
}

/** Inicia o job; `work` roda solto e o resultado (ou o erro) fica guardado. */
export function startJob<T, M>(base: { kind: JobKind; scope: number; owner: string; meta: M }, work: () => Promise<T>): Job<T, M> {
  sweep();
  const job: Job<T, M> = { ...base, id: randomUUID(), status: "running", startedAt: Date.now() };
  store.set(job.id, job as Job<unknown>);
  work().then(
    (result) => Object.assign(job, { status: "done", result, finishedAt: Date.now() }),
    (e: Error) => Object.assign(job, { status: "error", error: e.message, finishedAt: Date.now() }),
  );
  return job;
}

/** Job desta pessoa (outra pessoa não enxerga o job de ninguém). */
export function findJob<T, M>(kind: JobKind, id: string, scope: number, owner: string): Job<T, M> | null {
  const job = store.get(id);
  return job && job.kind === kind && job.scope === scope && sameUser(job.owner, owner) ? (job as Job<T, M>) : null;
}

/** Job mais recente de um escopo, de qualquer pessoa (o diagnóstico automático é de todos que veem o run). */
export function latestJob<T, M>(kind: JobKind, scope: number): Job<T, M> | null {
  let last: Job<unknown> | null = null;
  for (const job of store.values()) if (job.kind === kind && job.scope === scope && (!last || job.startedAt > last.startedAt)) last = job;
  return last as Job<T, M> | null;
}
