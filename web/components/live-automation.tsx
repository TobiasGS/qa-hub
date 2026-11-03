"use client";

import { Bot } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Card } from "./ui";

interface LiveView {
  active: boolean;
  caseId?: number | null;
  title?: string;
  step?: string;
  updatedAt?: number;
  frameAt?: number | null;
}

/** Com automação rodando: consulta a cada 1 s; parado: a cada 4 s, só para perceber o início. */
const ACTIVE_MS = 1000;
const IDLE_MS = 4000;
/** A tabela do run acompanha caso a caso enquanto a automação roda. */
const REFRESH_MS = 5000;

/**
 * "Automação ao vivo": o navegador do robô (último print recebido), o caso e o passo atuais.
 * Aparece só enquanto o Playwright está mandando quadros para este run.
 */
export function LiveAutomation({ runId, caseIndex }: { runId: number; caseIndex: Record<number, number> }) {
  const router = useRouter();
  const [live, setLive] = useState<LiveView>({ active: false });
  const [now, setNow] = useState(() => Date.now());
  const wasActive = useRef(false);
  const lastRefresh = useRef(0);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      if (document.visibilityState === "visible") {
        const next = await fetch(`/api/runs/${runId}/live`, { cache: "no-store" })
          .then((r) => (r.ok ? (r.json() as Promise<LiveView>) : { active: false }))
          .catch(() => ({ active: false }));
        if (stop) return;
        setLive(next);
        setNow(Date.now());
        if (next.active && Date.now() - lastRefresh.current > REFRESH_MS) {
          lastRefresh.current = Date.now();
          router.refresh();
        }
        // Acabou: uma última atualização traz os resultados finais.
        if (wasActive.current && !next.active) router.refresh();
        wasActive.current = next.active;
      }
      timer = setTimeout(tick, wasActive.current ? ACTIVE_MS : IDLE_MS);
    }
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [runId, router]);

  if (!live.active) return null;
  const ago = live.updatedAt ? Math.max(0, Math.round((now - live.updatedAt) / 1000)) : 0;
  const index = live.caseId ? caseIndex[live.caseId] : undefined;

  return (
    <Card className="mb-3 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Bot className="size-4 text-accent" aria-hidden /> Automação ao vivo
          <span className="inline-flex items-center gap-1.5 rounded-md bg-passed/15 px-2 py-0.5 text-xs font-medium">
            <span className="size-2 animate-pulse rounded-full bg-passed" aria-hidden /> rodando · há {ago}s
          </span>
        </h2>
        <p className="min-w-0 text-sm text-fg-2">
          {live.caseId ? (
            index !== undefined ? (
              <Link href={`/runs/${runId}/execute?i=${index}`} className="font-medium text-fg hover:underline">
                {live.title || `TC-${live.caseId}`}
              </Link>
            ) : (
              <span className="font-medium text-fg">{live.title || `TC-${live.caseId}`}</span>
            )
          ) : (
            "Preparando…"
          )}
          {live.step && <span className="text-muted"> · {live.step}</span>}
        </p>
      </div>
      {live.frameAt ? (
        // eslint-disable-next-line @next/next/no-img-element -- imagem dinâmica, trocada a cada quadro
        <img src={`/api/runs/${runId}/live/frame?t=${live.frameAt}`} alt="Tela atual do navegador da automação" className="block w-full border-t border-border bg-black object-contain" style={{ maxHeight: "70vh" }} />
      ) : (
        <p className="border-t border-border px-5 py-10 text-center text-sm text-muted">Aguardando a primeira imagem do navegador…</p>
      )}
    </Card>
  );
}
