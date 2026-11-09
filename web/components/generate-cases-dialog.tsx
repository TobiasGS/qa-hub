"use client";

import { Check, Loader2, MessageSquarePlus, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Flow, StoryAnalysis } from "@/lib/ai/parse";
import { send } from "@/lib/client-api";
import type { CaseOptions } from "./case-form";
import { Dialog } from "./dialog";
import { Badge, Button, cn, inputStyles } from "./ui";

interface Proposed {
  title: string;
  priority: "alta" | "média" | "baixa";
  flow: Flow;
  /** Resumo, pré-condições, dados, Gherkin, resultado esperado e impacto (vira o texto do caso). */
  text: string;
  selected: boolean;
}

interface JobView {
  job: string;
  status: "running" | "done" | "error";
  story: { title: string };
  elapsed: number;
  cases?: Omit<Proposed, "selected">[];
  analysis?: StoryAnalysis;
  error?: string;
}

/** Intervalo entre as consultas ao andamento da geração. */
const POLL_MS = 3000;

const FLOW_STYLE: Record<Flow, string> = { principal: "bg-passed/15", alternativo: "bg-accent/15", exceção: "bg-failed/15", borda: "bg-blocked/15" };

/** Liga a prioridade proposta (alta/média/baixa) às prioridades do Kiwi (ex.: P1..P5 ou Alta/Média/Baixa). */
function priorityId(options: CaseOptions, p: Proposed["priority"]) {
  const list = options.priorities;
  const byName = list.find((x) => x.value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") === p.normalize("NFD").replace(/[̀-ͯ]/g, ""));
  if (byName) return byName.id;
  const index = p === "alta" ? 0 : p === "baixa" ? list.length - 1 : Math.floor((list.length - 1) / 2);
  return list[index]?.id;
}

const formatElapsed = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}min ${String(s % 60).padStart(2, "0")}s`);

/** "Gerar casos da história": análise e proposta da IA → revisão → criação dos casos escolhidos. */
export function GenerateCasesButton({ planId, cardKey, options }: { planId: number; cardKey: string; options: CaseOptions }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [story, setStory] = useState<{ title: string } | null>(null);
  const [cases, setCases] = useState<Proposed[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [analysis, setAnalysis] = useState<StoryAnalysis | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [comment, setComment] = useState<"idle" | "sending" | "sent">("idle");
  // Geração acompanhada agora; trocar (Gerar de novo) ou fechar o diálogo descarta a anterior.
  const current = useRef(0);
  useEffect(() => () => void current.current++, []);

  /** Inicia a geração no servidor e consulta o andamento até terminar (a IA pode levar minutos). */
  async function generate() {
    const run = ++current.current;
    setOpen(true);
    setLoading(true);
    setError(null);
    setCases([]);
    setAnalysis(null);
    setComment("idle");
    setElapsed(0);
    try {
      let r = await send<JobView>(`/api/plans/${planId}/generate-cases`, "POST");
      setStory(r.story);
      while (r.status === "running") {
        await new Promise((ok) => setTimeout(ok, POLL_MS));
        if (run !== current.current) return;
        r = await send<JobView>(`/api/plans/${planId}/generate-cases?job=${r.job}`, "GET");
        setElapsed(r.elapsed);
      }
      if (run !== current.current) return;
      if (r.status === "error") throw new Error(r.error);
      setCases((r.cases ?? []).map((c) => ({ ...c, selected: true })));
      setAnalysis(r.analysis ?? null);
      setJobId(r.job);
    } catch (e) {
      if (run === current.current) setError((e as Error).message);
    } finally {
      if (run === current.current) setLoading(false);
    }
  }

  function close() {
    if (saving) return;
    current.current++; // para de acompanhar; o que já estava gerando é descartado
    setLoading(false);
    setOpen(false);
  }

  const update = (i: number, patch: Partial<Proposed>) => setCases((list) => list.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const chosen = cases.filter((c) => c.selected && c.title.trim() && c.text.trim());

  async function sendAnalysis() {
    setError(null);
    setComment("sending");
    try {
      await send(`/api/plans/${planId}/analysis-comment`, "POST", { job: jobId });
      setComment("sent");
    } catch (e) {
      setComment("idle");
      setError((e as Error).message);
    }
  }

  async function save() {
    const confirmed = options.statuses.find((s) => s.name === "CONFIRMED")?.id ?? options.statuses[0]?.id;
    const category = options.categories[0]?.id;
    setError(null);
    let created = 0;
    try {
      for (const c of chosen) {
        setSaving(`Criando ${created + 1} de ${chosen.length}…`);
        await send(`/api/plans/${planId}/cases`, "POST", {
          summary: c.title.trim(),
          text: c.text.trim(),
          requirement: cardKey,
          priority: priorityId(options, c.priority),
          category,
          case_status: confirmed,
          is_automated: false,
        });
        created++;
      }
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(`${created} caso(s) criado(s); parou no próximo: ${(e as Error).message}`);
      router.refresh();
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      <Button onClick={generate} title={`Analisa a história ${cardKey} e propõe casos de teste (IA)`}>
        <Sparkles className="size-4" /> Gerar casos da história
      </Button>
      <Dialog open={open} onClose={close} title="Gerar casos da história" description={story ? `${cardKey} · ${story.title}` : cardKey} wide>
        {loading && (
          <div className="py-6 text-sm text-fg-2">
            <p className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" /> Analisando a história e gerando os casos…
              {elapsed > 0 && <span className="tabular text-muted">{formatElapsed(elapsed)}</span>}
            </p>
            <p className="mt-2 text-xs text-muted">
              {elapsed < 90
                ? "Costuma levar de 1 a 2 minutos: a IA analisa a história antes de escrever os cenários."
                : "A IA está demorando (histórias longas ou a API sobrecarregada). Pode levar alguns minutos; deixe esta janela aberta."}
            </p>
          </div>
        )}
        {error && <p className="mb-3 rounded-lg bg-failed/10 px-3 py-2 text-sm text-failed-text">{error}</p>}
        {error && !loading && cases.length === 0 && (
          <Button onClick={generate}>
            <Sparkles className="size-4" /> Tentar de novo
          </Button>
        )}
        {!loading && cases.length > 0 && (
          <>
            {analysis && <AnalysisPanel analysis={analysis} />}
            {analysis && (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Button onClick={sendAnalysis} disabled={comment !== "idle" || !jobId} title={`Publica a análise como comentário no card ${cardKey}`}>
                  {comment === "sending" ? <Loader2 className="size-4 animate-spin" /> : comment === "sent" ? <Check className="size-4" /> : <MessageSquarePlus className="size-4" />}
                  {comment === "sent" ? "Análise enviada ao card" : "Enviar análise ao card"}
                </Button>
                <span className="text-xs text-muted">Vira um comentário em {cardKey}, para o PO ver os pontos de atenção.</span>
              </div>
            )}
            <p className="mb-3 text-sm text-fg-2">
              Revise antes de salvar: desmarque o que não quiser e ajuste título e passos. Os casos são criados ligados a <b>{cardKey}</b>.
            </p>
            <ul className="space-y-3">
              {cases.map((c, i) => (
                <li key={i} className={cn("rounded-lg border border-border p-3", !c.selected && "opacity-50")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <input type="checkbox" checked={c.selected} onChange={(e) => update(i, { selected: e.target.checked })} className="size-4 accent-[var(--accent)]" aria-label="Incluir caso" />
                    <input value={c.title} onChange={(e) => update(i, { title: e.target.value })} maxLength={255} className={cn(inputStyles, "h-8 min-w-0 flex-1 font-medium")} aria-label="Título do caso" />
                    <select value={c.priority} onChange={(e) => update(i, { priority: e.target.value as Proposed["priority"] })} className={cn(inputStyles, "h-8 text-xs")} aria-label="Prioridade">
                      <option value="alta">Alta</option>
                      <option value="média">Média</option>
                      <option value="baixa">Baixa</option>
                    </select>
                    <Badge className={FLOW_STYLE[c.flow]}>{c.flow}</Badge>
                  </div>
                  <textarea
                    value={c.text}
                    onChange={(e) => update(i, { text: e.target.value })}
                    rows={Math.min(16, c.text.split("\n").length + 1)}
                    className={cn(inputStyles, "mt-2 h-auto w-full py-2 font-mono text-xs leading-relaxed")}
                    aria-label="Resumo, pré-condições, dados, passos e resultado esperado"
                  />
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between gap-2">
              <Button onClick={generate} disabled={!!saving}>
                <Sparkles className="size-4" /> Gerar de novo
              </Button>
              <div className="flex items-center gap-2">
                {saving && <span className="text-xs text-muted">{saving}</span>}
                <Button variant="primary" onClick={save} disabled={!chosen.length || !!saving}>
                  {saving && <Loader2 className="size-4 animate-spin" />} Criar {chosen.length} caso{chosen.length === 1 ? "" : "s"}
                </Button>
              </div>
            </div>
          </>
        )}
      </Dialog>
    </>
  );
}

const IMPACT_STYLE = { alto: "danger", médio: "warn", baixo: "neutral" } as const;

/** Análise da história (resumo, pontos de atenção, não funcionais, impacto). */
function AnalysisPanel({ analysis: a }: { analysis: StoryAnalysis }) {
  const nf = [
    ["Segurança", a.nonFunctional.security],
    ["Performance", a.nonFunctional.performance],
    ["Usabilidade", a.nonFunctional.usability],
  ] as const;
  return (
    <section className="mb-3 rounded-lg border border-border bg-surface-2/40 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">Análise da história</h3>
        <Badge variant={IMPACT_STYLE[a.impact.level]}>Impacto {a.impact.level}</Badge>
      </div>
      {a.summary && <p className="mt-1 text-fg-2">{a.summary}</p>}
      {a.impact.reason && <p className="mt-1 text-xs text-muted">{a.impact.reason}</p>}
      {a.points.length > 0 && (
        <details className="mt-2" open>
          <summary className="cursor-pointer font-medium">Pontos de atenção ({a.points.length})</summary>
          <ul className="mt-1 space-y-1 pl-4">
            {a.points.map((p, i) => (
              <li key={i} className="list-disc text-fg-2">
                <span className="text-xs font-medium text-warn">{p.type}</span> {p.text}
              </li>
            ))}
          </ul>
        </details>
      )}
      {nf.some(([, items]) => items.length > 0) && (
        <details className="mt-2">
          <summary className="cursor-pointer font-medium">Testes não funcionais sugeridos</summary>
          {nf.map(([label, items]) =>
            items.length ? (
              <div key={label} className="mt-1">
                <p className="text-xs font-semibold text-fg-2">{label}</p>
                <ul className="pl-4">
                  {items.map((t, i) => (
                    <li key={i} className="list-disc text-fg-2">
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
        </details>
      )}
    </section>
  );
}
