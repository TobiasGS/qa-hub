import "server-only";

// Automação ao vivo: o último quadro (print JPEG) do navegador do robô e o passo atual,
// por run. Só em memória (um container), só o último quadro: é para assistir, não guardar.

export interface LiveState {
  runId: number;
  caseId: number | null;
  title: string;
  step: string;
  /** Status do caso que acabou de terminar (passed/failed…), quando o evento é de fim. */
  status: string | null;
  updatedAt: number;
  frame: Buffer | null;
  frameAt: number;
}

/** Sem novidade há esse tempo, o run deixa de estar "ao vivo". */
export const LIVE_TIMEOUT_MS = 30_000;

const store = ((globalThis as { __qahubLive?: Map<number, LiveState> }).__qahubLive ??= new Map());

export function updateLive(runId: number, patch: Partial<Omit<LiveState, "runId" | "updatedAt">>) {
  const current = store.get(runId) ?? { runId, caseId: null, title: "", step: "", status: null, updatedAt: 0, frame: null, frameAt: 0 };
  const next = { ...current, ...patch, updatedAt: Date.now() };
  if (patch.frame) next.frameAt = Date.now();
  store.set(runId, next);
}

export function endLive(runId: number) {
  store.delete(runId);
}

export function getLive(runId: number): LiveState | null {
  const s = store.get(runId);
  if (!s) return null;
  if (Date.now() - s.updatedAt > LIVE_TIMEOUT_MS) {
    store.delete(runId);
    return null;
  }
  return s;
}
