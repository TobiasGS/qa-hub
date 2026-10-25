// Cronômetro da execução. Funciona no servidor e no navegador.
//
// O tempo efetivo (sem pausas) fica no próprio Kiwi: ao finalizar, gravamos
// stop_date = agora e start_date = agora − tempo acumulado. A linha do tempo
// (início, pausas, retomadas, fim) vai em comentários legíveis no Kiwi, com um
// marcador que dá para ler de volta:  "⏱ Pausado · 4min 12s [qahub-timer:pause:252]"

import type { Comment, TestExecution } from "./kiwi/types";

export type TimerEvent = "start" | "pause" | "resume" | "finish";

export interface TimerEntry {
  event: TimerEvent;
  /** Segundos acumulados (efetivos) no momento do evento. */
  elapsed: number;
  /** Status final, só em "finish" (ex.: PASSED). */
  status?: string;
  at: string;
  user?: string;
}

const MARKER = /\[qahub-timer:(start|pause|resume|finish)(?::([A-Z_]+))?:(\d+)\]/;
const LABEL: Record<TimerEvent, string> = { start: "Iniciado", pause: "Pausado", resume: "Retomado", finish: "Finalizado" };

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${String(m).padStart(2, "0")}min`;
  if (m) return `${m}min ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}

/** Relógio do cronômetro: 00:04:12 */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":");
}

export function timerComment(event: TimerEvent, elapsed: number, status?: string): string {
  const label = event === "finish" && status ? `${LABEL.finish} (${status})` : LABEL[event];
  const tag = `[qahub-timer:${event}${event === "finish" && status ? `:${status}` : ""}:${Math.round(elapsed)}]`;
  return `⏱ ${label} · ${formatDuration(elapsed)} ${tag}`;
}

export const isTimerComment = (text: string) => MARKER.test(text);

export function parseTimerComments(comments: Comment[]): TimerEntry[] {
  const entries: TimerEntry[] = [];
  for (const c of comments) {
    const m = c.comment.match(MARKER);
    if (m) entries.push({ event: m[1] as TimerEvent, status: m[2], elapsed: Number(m[3]), at: c.submit_date, user: c.user__username });
  }
  return entries.sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * Datas do Kiwi para milissegundos. O Kiwi devolve UTC sem fuso ("2026-10-25T17:13:50");
 * sem o "Z" o JavaScript leria como horário local e erraria pelo fuso (3 h no Brasil).
 */
export function parseKiwiDate(value: string): number {
  const iso = value.includes("T") ? value : value.replace(" ", "T");
  return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}Z`);
}

/** Tempo efetivo de uma execução finalizada (stop − start), em segundos; null se não há dado confiável. */
export function durationOf(e: Pick<TestExecution, "start_date" | "stop_date">): number | null {
  if (!e.start_date || !e.stop_date) return null;
  const seconds = (parseKiwiDate(e.stop_date) - parseKiwiDate(e.start_date)) / 1000;
  // Descarta valores absurdos (datas antigas sem cronômetro, execuções esquecidas abertas).
  return seconds > 0 && seconds < 12 * 3600 ? seconds : null;
}

/** "AAAA-MM-DD HH:MM:SS" em UTC, formato aceito pelo TestExecution.update do Kiwi. */
export function kiwiDate(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}
