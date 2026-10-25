"use client";

import { Pause, Play, Timer } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ExecutionStatus, TestExecution } from "@/lib/kiwi/types";
import { durationOf, formatClock, parseKiwiDate, type TimerEvent } from "@/lib/timer";
import { cn } from "./ui";

const MAX = 12 * 3600;
/** Só registra o início depois de alguns segundos no caso: navegar rápido com J/K não gera ruído. */
const START_DELAY_MS = 1500;

interface State {
  id: number;
  /** Segundos acumulados até `since`. */
  base: number;
  /** Desde quando está correndo (ms); null = pausado ou finalizado. */
  since: number | null;
  finished: boolean;
}

const elapsedOf = (s: State | null) => (s ? Math.min(MAX, s.base + (s.since ? (Date.now() - s.since) / 1000 : 0)) : 0);

function post(id: number, event: TimerEvent, elapsed: number, beacon = false): Promise<TestExecution | null> {
  const body = JSON.stringify({ event, elapsed: Math.round(elapsed) });
  const url = `/api/executions/${id}/timer`;
  if (beacon && navigator.sendBeacon) {
    navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    return Promise.resolve(null);
  }
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true })
    .then((r) => r.json())
    .then((b) => (b.execution as TestExecution) ?? null)
    .catch(() => null);
}

/**
 * Cronômetro da execução atual. Começa sozinho ao abrir um caso pendente,
 * pausa ao trocar de caso, esconder a aba ou sair, e retoma ao voltar.
 */
export function useExecutionTimer(execution: TestExecution | undefined, statuses: ExecutionStatus[], onServerUpdate: (e: TestExecution) => void) {
  const [state, setState] = useState<State | null>(null);
  const [, setTick] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const recorded = useRef(false); // o "start/resume" já foi enviado ao servidor?
  const autoPaused = useRef(false);
  const onUpdate = useRef(onServerUpdate);
  onUpdate.current = onServerUpdate;

  const send = useCallback((id: number, event: TimerEvent, elapsed: number, beacon = false) => {
    post(id, event, elapsed, beacon).then((e) => e && onUpdate.current(e));
  }, []);

  // Troca de caso: decide o estado inicial e agenda o registro do início.
  useEffect(() => {
    if (!execution) return;
    const weight = statuses.find((s) => s.id === execution.status)?.weight ?? 0;
    recorded.current = false;
    autoPaused.current = false;
    if (weight !== 0) {
      setState({ id: execution.id, base: durationOf(execution) ?? 0, since: null, finished: true });
      return;
    }
    const base =
      execution.status__name === "RUNNING" && execution.start_date
        ? Math.min(MAX, (Date.now() - parseKiwiDate(execution.start_date)) / 1000)
        : execution.status__name === "PAUSED"
          ? (durationOf(execution) ?? 0)
          : 0;
    setState({ id: execution.id, base, since: Date.now(), finished: false });
    const timer = setTimeout(() => {
      recorded.current = true;
      send(execution.id, base > 0 ? "resume" : "start", base);
    }, START_DELAY_MS);
    return () => {
      clearTimeout(timer);
      const s = stateRef.current;
      if (recorded.current && s && s.id === execution.id && s.since) send(s.id, "pause", elapsedOf(s));
    };
    // Só reage à troca de caso; mudanças de status são tratadas por finish().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execution?.id]);

  // Relógio na tela.
  useEffect(() => {
    if (!state?.since) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [state?.since]);

  const pause = useCallback(() => {
    const s = stateRef.current;
    if (!s?.since) return;
    const elapsed = elapsedOf(s);
    setState({ ...s, base: elapsed, since: null });
    if (recorded.current) send(s.id, "pause", elapsed);
  }, [send]);

  const resume = useCallback(() => {
    const s = stateRef.current;
    if (!s || s.since || s.finished) return;
    setState({ ...s, since: Date.now() });
    recorded.current = true;
    send(s.id, "resume", s.base);
  }, [send]);

  // Aba escondida ou página fechando: pausa (com sendBeacon, que sobrevive ao fechamento).
  useEffect(() => {
    function onVisibility() {
      const s = stateRef.current;
      if (document.visibilityState === "hidden" && s?.since) {
        const elapsed = elapsedOf(s);
        setState({ ...s, base: elapsed, since: null });
        autoPaused.current = true;
        if (recorded.current) send(s.id, "pause", elapsed, true);
      } else if (document.visibilityState === "visible" && autoPaused.current) {
        autoPaused.current = false;
        resume();
      }
    }
    function onPageHide() {
      const s = stateRef.current;
      if (s?.since && recorded.current) send(s.id, "pause", elapsedOf(s), true);
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [resume, send]);

  /** Para o cronômetro ao registrar o resultado; devolve o tempo efetivo para gravar. */
  const finish = useCallback(() => {
    const s = stateRef.current;
    const elapsed = elapsedOf(s);
    if (s) setState({ ...s, base: elapsed, since: null, finished: true });
    recorded.current = false;
    return elapsed;
  }, []);

  return {
    elapsed: elapsedOf(state),
    running: !!state?.since,
    finished: !!state?.finished,
    pause,
    resume,
    toggle: () => (stateRef.current?.since ? pause() : resume()),
    finish,
    /** Tempo atual sem parar o relógio. */
    current: () => elapsedOf(stateRef.current),
  };
}

export function TimerBar({ timer }: { timer: ReturnType<typeof useExecutionTimer> }) {
  const label = timer.finished ? "Tempo gasto" : timer.running ? "Em execução" : "Pausado";
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-2",
        timer.running ? "border-accent/40 bg-accent/10" : "border-border bg-surface-2",
      )}
    >
      <Timer className={cn("size-5 shrink-0", timer.running ? "text-accent" : "text-muted")} aria-hidden />
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</div>
        <div className="font-mono text-xl font-semibold tabular" aria-live="off">
          {formatClock(timer.elapsed)}
        </div>
      </div>
      {!timer.finished && (
        <button
          onClick={timer.toggle}
          className="ml-auto inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium hover:bg-surface-2"
          aria-label={timer.running ? "Pausar cronômetro" : "Retomar cronômetro"}
        >
          {timer.running ? <Pause className="size-4" /> : <Play className="size-4" />}
          {timer.running ? "Pausar" : "Retomar"}
          <kbd className="hidden rounded border border-border px-1 text-[10px] text-muted sm:inline">Espaço</kbd>
        </button>
      )}
    </div>
  );
}
