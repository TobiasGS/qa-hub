"use client";

import { Bot, Check, Copy, Download, Loader2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { send } from "@/lib/client-api";
import type { TestCase } from "@/lib/kiwi/types";
import { Dialog } from "./dialog";
import { Button } from "./ui";

interface JobView {
  job: string;
  status: "running" | "done" | "error";
  elapsed: number;
  spec?: { filename: string; code: string };
  /** Pasta do sistema (Projetos → Configurar automação), se configurada. */
  folder?: string | null;
  error?: string;
}

const POLL_MS = 3000;
const formatElapsed = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}min ${String(s % 60).padStart(2, "0")}s`);

/** "Gerar teste Playwright": a IA escreve o *.spec.ts do caso; a pessoa copia ou baixa. */
export function PlaywrightDialog({ planId, testCase, onClose }: { planId: number; testCase: TestCase; onClose: () => void }) {
  const router = useRouter();
  const [view, setView] = useState<JobView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [automated, setAutomated] = useState(testCase.is_automated);
  const current = useRef(0);
  useEffect(() => () => void current.current++, []);

  const generate = useCallback(async () => {
    const run = ++current.current;
    setError(null);
    setView(null);
    try {
      let r = await send<JobView>(`/api/cases/${testCase.id}/playwright`, "POST", { plan: planId });
      setView(r);
      while (r.status === "running") {
        await new Promise((ok) => setTimeout(ok, POLL_MS));
        if (run !== current.current) return;
        r = await send<JobView>(`/api/cases/${testCase.id}/playwright?job=${r.job}`, "GET");
        setView(r);
      }
      if (r.status === "error") setError(r.error ?? "Falha na geração");
    } catch (e) {
      if (run === current.current) setError((e as Error).message);
    }
  }, [planId, testCase.id]);

  useEffect(() => {
    generate();
  }, [generate]);

  const spec = view?.status === "done" ? view.spec : undefined;

  function download() {
    if (!spec) return;
    const url = URL.createObjectURL(new Blob([spec.code], { type: "text/plain;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: spec.filename });
    a.click();
    URL.revokeObjectURL(url);
  }

  async function markAutomated() {
    await send(`/api/cases/${testCase.id}`, "PATCH", { is_automated: true });
    setAutomated(true);
    router.refresh();
  }

  return (
    <Dialog open onClose={onClose} title="Gerar teste Playwright" description={`TC-${testCase.id} · ${testCase.summary}`} wide>
      {view?.status === "running" && (
        <p className="flex items-center gap-2 py-6 text-sm text-fg-2">
          <Loader2 className="size-4 animate-spin" /> Escrevendo o teste a partir do Dado/Quando/Então… <span className="tabular text-muted">{formatElapsed(view.elapsed)}</span>
        </p>
      )}
      {!view && !error && (
        <p className="flex items-center gap-2 py-6 text-sm text-fg-2">
          <Loader2 className="size-4 animate-spin" /> Iniciando…
        </p>
      )}
      {error && (
        <div className="space-y-3">
          <p className="rounded-lg bg-failed/10 px-3 py-2 text-sm text-failed">{error}</p>
          <Button onClick={generate}>
            <RotateCcw className="size-4" /> Tentar de novo
          </Button>
        </div>
      )}
      {spec && (
        <div className="space-y-3">
          <p className="text-sm text-fg-2">
            Salve como <b className="font-mono">tests/{view?.folder ? `${view.folder}/` : ""}{spec.filename}</b> no repositório de testes. Revise os pontos marcados com <span className="font-mono">TODO</span>: os seletores são
            palpites até alguém conferir na tela (<span className="font-mono">npx playwright codegen</span>). O título já leva <b>[TC-{testCase.id}]</b>, então o resultado do pipeline cai neste caso.
          </p>
          <pre className="max-h-[50vh] overflow-auto rounded-lg border border-border bg-surface-2 p-4 font-mono text-xs leading-relaxed">{spec.code}</pre>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button onClick={generate}>
              <RotateCcw className="size-4" /> Gerar de novo
            </Button>
            <div className="flex flex-wrap gap-2">
              {!automated ? (
                <Button onClick={markAutomated}>
                  <Bot className="size-4" /> Marcar como automatizado
                </Button>
              ) : (
                <span className="inline-flex items-center gap-1 text-sm text-fg-2">
                  <Bot className="size-4" /> Caso automatizado
                </span>
              )}
              <Button
                onClick={async () => {
                  await navigator.clipboard.writeText(spec.code);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copiado" : "Copiar"}
              </Button>
              <Button variant="primary" onClick={download}>
                <Download className="size-4" /> Baixar .spec.ts
              </Button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
