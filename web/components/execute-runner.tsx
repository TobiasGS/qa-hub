"use client";

import { ArrowLeft, Ban, Bug, CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, Loader2, MessageSquare, XCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isEvidence } from "@/lib/evidence/shared";
import type { Comment, ExecutionStatus, LinkReference, TestExecution, TestRun } from "@/lib/kiwi/types";
import { outcomeOf, summarize, type Outcome } from "@/lib/metrics";
import { send } from "@/lib/client-api";
import { parseKiwiDate } from "@/lib/timer";
import { BugDialog } from "./bug-dialog";
import { CaseHistory } from "./case-history";
import { EvidencePanel } from "./evidence-panel";
import { TimerBar, useExecutionTimer } from "./execution-timer";
import { ProgressBar, StatusBadge } from "./status";
import { Badge, Button, Card, cn, inputStyles } from "./ui";

interface CaseInfo {
  id: number;
  text: string;
  priority: string;
  requirement: string | null;
}

const ACTIONS: { outcome: Outcome; status: string; label: string; key: string; icon: typeof CheckCircle2; className: string }[] = [
  { outcome: "passed", status: "PASSED", label: "Passou", key: "P", icon: CheckCircle2, className: "bg-passed text-white hover:opacity-90" },
  { outcome: "failed", status: "FAILED", label: "Falhou", key: "F", icon: XCircle, className: "bg-failed text-white hover:opacity-90" },
  { outcome: "blocked", status: "BLOCKED", label: "Bloqueado", key: "B", icon: Ban, className: "bg-blocked text-black hover:opacity-90" },
];

const STATUS_LABEL: Record<string, string> = {
  IDLE: "Não executado",
  RUNNING: "Em execução",
  PAUSED: "Pausado",
  PASSED: "Passou",
  FAILED: "Falhou",
  BLOCKED: "Bloqueado",
  ERROR: "Erro",
  WAIVED: "Dispensado",
};
const statusLabel = (name: string) => STATUS_LABEL[name] ?? name;
const commentTime = (iso: string) => new Date(parseKiwiDate(iso)).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** O texto do caso no Kiwi é Markdown; aqui só o negrito é renderizado, o resto fica como texto. */
function SimpleMarkdown({ text }: { text: string }) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-fg">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}

export function ExecuteRunner(props: {
  run: TestRun;
  executions: TestExecution[];
  statuses: ExecutionStatus[];
  cases: CaseInfo[];
  links: LinkReference[];
  /** Caso para abrir primeiro (vindo de ?i= na URL); sem ele, o primeiro pendente. */
  initialIndex?: number;
}) {
  const { run, statuses } = props;
  const [executions, setExecutions] = useState(props.executions);
  const [links, setLinks] = useState(props.links);
  const firstPending = executions.findIndex((e) => outcomeOf(e.status, statuses) === "pending");
  const [index, setIndex] = useState(
    props.initialIndex !== undefined && props.initialIndex >= 0 && props.initialIndex < executions.length ? props.initialIndex : Math.max(0, firstPending),
  );
  // Comentário em edição de cada execução: trocar de caso não apaga o que foi escrito.
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  // Comentários já gravados no Kiwi, por execução (carregados ao abrir o caso).
  const [saved, setSaved] = useState<Record<number, Comment[]>>({});
  const [savingComment, setSavingComment] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualBug, setManualBug] = useState(false);
  const [bugUrl, setBugUrl] = useState("");
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const current = executions[index];
  const comment = current ? (drafts[current.id] ?? "") : "";
  const setComment = (text: string) => current && setDrafts((d) => ({ ...d, [current.id]: text }));
  const info = props.cases.find((c) => c.id === current?.case);
  const outcome = current ? outcomeOf(current.status, statuses) : "pending";
  const currentBugs = links.filter((l) => l.execution === current?.id && l.is_defect);
  const summary = useMemo(() => summarize(executions, statuses), [executions, statuses]);
  const replaceExecution = useCallback((updated: TestExecution) => setExecutions((list) => list.map((e) => (e.id === updated.id ? { ...e, ...updated } : e))), []);
  const timer = useExecutionTimer(current, statuses, replaceExecution);
  const [bugOpen, setBugOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadComments = useCallback(async (executionId: number) => {
    const { comments } = await send<{ comments: Comment[] }>(`/api/executions/${executionId}/comments`, "GET");
    setSaved((s) => ({ ...s, [executionId]: comments }));
  }, []);

  /** Grava o comentário em edição da execução (sem mudar o resultado). */
  const saveComment = useCallback(async (executionId: number) => {
    const text = draftsRef.current[executionId]?.trim();
    if (!text) return;
    setSavingComment(true);
    try {
      const { comments } = await send<{ comments: Comment[] }>(`/api/executions/${executionId}/comments`, "POST", { comment: text });
      setSaved((s) => ({ ...s, [executionId]: comments }));
      // Só limpa se ninguém escreveu mais nada enquanto gravava.
      setDrafts((d) => (d[executionId]?.trim() === text ? { ...d, [executionId]: "" } : d));
    } catch (e) {
      setError(`O comentário não foi salvo: ${(e as Error).message}`);
    } finally {
      setSavingComment(false);
    }
  }, []);

  useEffect(() => {
    if (current && !saved[current.id]) loadComments(current.id).catch(() => {});
  }, [current, saved, loadComments]);

  const go = useCallback(
    (i: number) => {
      // Ao sair do caso, o comentário escrito é salvo (o anexo já é salvo na hora).
      if (current && draftsRef.current[current.id]?.trim()) saveComment(current.id);
      setIndex(Math.min(Math.max(i, 0), executions.length - 1));
      setError(null);
      setManualBug(false);
    },
    [current, executions.length, saveComment],
  );

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const setStatus = useCallback(
    async (statusName: string) => {
      const status = statuses.find((s) => s.name === statusName);
      if (!current || !status || busy) return;
      setBusy(statusName);
      setError(null);
      try {
        const res = await fetch(`/api/executions/${current.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          // O tempo efetivo do cronômetro vai junto e fica gravado no Kiwi.
          body: JSON.stringify({ status: status.id, comment: comment.trim() || undefined, elapsed: Math.round(timer.current()) }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Falha ao salvar");
        const updated: TestExecution = body.execution;
        timer.finish();
        if (body.run === "closed") setNotice("Todos os casos executados: run concluído.");
        else if (body.run === "reopened") setNotice("Run reaberto: há casos pendentes de novo.");
        const next = executions.map((e) => (e.id === updated.id ? { ...e, ...updated } : e));
        setExecutions(next);
        // O comentário foi junto com o resultado: limpa já (inclusive a ref), para o go() abaixo não gravá-lo de novo.
        if (comment.trim()) {
          draftsRef.current = { ...draftsRef.current, [updated.id]: "" };
          setDrafts(draftsRef.current);
        }
        loadComments(updated.id).catch(() => {});
        // Passou: vai para o próximo pendente. Falhou/bloqueou: fica para abrir o bug.
        if (status.weight > 0) {
          const after = next.findIndex((e, i) => i > index && outcomeOf(e.status, statuses) === "pending");
          if (after >= 0) go(after);
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [busy, comment, current, executions, go, index, loadComments, statuses, timer],
  );

  /** Vincula um bug que já existe (URL colada). */
  async function linkBug(url: string) {
    if (!current) return;
    setBusy("bug");
    setError(null);
    try {
      const { link } = await send<{ link: LinkReference }>(`/api/executions/${current.id}/bug`, "POST", { url });
      setLinks((l) => [...l, link]);
      setManualBug(false);
      setBugUrl("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement;
      if (typing) {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "j" || e.key === "ArrowDown") go(index + 1);
      else if (k === "k" || e.key === "ArrowUp") go(index - 1);
      else if (k === "p") setStatus("PASSED");
      else if (k === "f") setStatus("FAILED");
      else if (k === "b") setStatus("BLOCKED");
      else if (k === "c") commentRef.current?.focus();
      else if (e.key === " ") timer.toggle();
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, setStatus, timer]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/runs/${run.id}`} className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
            <ArrowLeft className="size-3.5" /> Voltar ao run
          </Link>
          <h1 className="mt-1 truncate text-lg font-semibold tracking-tight">{run.summary}</h1>
        </div>
        <div className="w-full sm:w-64">
          <div className="mb-1 flex justify-between text-xs text-fg-2 tabular">
            <span>
              {summary.executed}/{summary.total} executados
            </span>
            <span>{summary.pending} pendentes</span>
          </div>
          <ProgressBar summary={summary} />
        </div>
      </div>

      {notice && (
        <p className="mb-3 rounded-lg border border-passed/40 bg-passed/10 px-4 py-2.5 text-sm" role="status">
          {notice}
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
        <Card className="overflow-hidden">
          <ul ref={listRef} className="max-h-56 divide-y divide-border overflow-y-auto lg:max-h-[calc(100vh-220px)]">
            {executions.map((e, i) => (
              <li key={e.id} data-index={i}>
                <button
                  onClick={() => go(i)}
                  className={cn("flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-surface-2", i === index && "bg-surface-2 font-medium")}
                  aria-current={i === index}
                >
                  <StatusBadge outcome={outcomeOf(e.status, statuses)} label="" className="shrink-0" />
                  <span className="truncate">{e.case__summary}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {current && (
          <Card className="flex flex-col p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-muted tabular">
                  TC-{current.case} · {index + 1} de {executions.length}
                </p>
                <h2 className="mt-0.5 text-lg font-semibold">{current.case__summary}</h2>
              </div>
              <StatusBadge outcome={outcome} label={statusLabel(current.status__name)} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {info?.priority && <Badge>Prioridade {info.priority}</Badge>}
              {info?.requirement && <Badge>{info.requirement}</Badge>}
              {current.tested_by__username && <Badge>por {current.tested_by__username}</Badge>}
            </div>

            <div className="mt-4">
              <TimerBar timer={timer} />
            </div>

            <div className="mt-4 whitespace-pre-wrap rounded-lg bg-surface-2 p-4 text-sm leading-relaxed text-fg-2">
              {info?.text?.trim() ? <SimpleMarkdown text={info.text.trim()} /> : "Este caso não tem passos cadastrados."}
            </div>

            {(saved[current.id]?.length ?? 0) > 0 && (
              <ul className="mt-4 space-y-2">
                {saved[current.id].map((c) => (
                  <li key={c.id} className="rounded-lg border border-border px-3 py-2 text-sm">
                    <p className="flex items-center gap-1.5 text-xs text-muted">
                      <MessageSquare className="size-3.5" /> {c.user__username ?? "—"} · {commentTime(c.submit_date)}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">{c.comment}</p>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 flex items-end justify-between gap-2">
              <label className="block text-xs font-medium text-fg-2" htmlFor="comment">
                Comentário / evidência <kbd className="ml-1 rounded border border-border px-1 text-[10px] text-muted">C</kbd>
              </label>
              {comment.trim() && (
                <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => saveComment(current.id)} disabled={savingComment}>
                  {savingComment ? <Loader2 className="size-3.5 animate-spin" /> : <MessageSquare className="size-3.5" />} Salvar comentário
                </Button>
              )}
            </div>
            <textarea
              id="comment"
              ref={commentRef}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  saveComment(current.id);
                }
              }}
              rows={3}
              placeholder="O que aconteceu? Cole links de prints ou vídeos. Ctrl+Enter salva; também é salvo ao registrar o resultado ou trocar de caso."
              className={cn(inputStyles, "mt-1 h-auto w-full py-2")}
            />

            <EvidencePanel
              key={current.id}
              executionId={current.id}
              evidence={links.filter((l) => l.execution === current.id && isEvidence(l))}
              onAdded={(link) => setLinks((l) => [...l, link])}
              onRemoved={(id) => setLinks((l) => l.filter((x) => x.id !== id))}
            />

            <div className="mt-3 grid grid-cols-3 gap-2">
              {ACTIONS.map((a) => (
                <Button key={a.status} className={a.className} onClick={() => setStatus(a.status)} disabled={!!busy}>
                  {busy === a.status ? <Loader2 className="size-4 animate-spin" /> : <a.icon className="size-4" />}
                  {a.label}
                  <kbd className="hidden rounded bg-black/15 px-1 text-[10px] sm:inline">{a.key}</kbd>
                </Button>
              ))}
            </div>

            {error && <p className="mt-3 text-sm text-failed">{error}</p>}

            {(outcome === "failed" || outcome === "blocked" || currentBugs.length > 0) && (
              <div className="mt-4 border-t border-border pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  {currentBugs.map((b) => (
                    <a key={b.id} href={b.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium hover:underline">
                      <Bug className="size-4 text-failed" /> {b.name || b.url} <ExternalLink className="size-3 text-muted" />
                    </a>
                  ))}
                  {(outcome === "failed" || outcome === "blocked") && (
                    <Button onClick={() => setBugOpen(true)} disabled={!!busy}>
                      {busy === "bug" ? <Loader2 className="size-4 animate-spin" /> : <Bug className="size-4" />} Abrir bug
                    </Button>
                  )}
                  {!manualBug && (outcome === "failed" || outcome === "blocked") && (
                    <button className="text-xs text-muted hover:text-fg" onClick={() => setManualBug(true)}>
                      ou vincular um bug existente
                    </button>
                  )}
                </div>
                {manualBug && (
                  <form
                    className="mt-3 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (bugUrl.trim()) linkBug(bugUrl.trim());
                    }}
                  >
                    <input
                      type="url"
                      required
                      value={bugUrl}
                      onChange={(e) => setBugUrl(e.target.value)}
                      placeholder="Link do bug (Azure ou Jira)"
                      className={cn(inputStyles, "min-w-0 flex-1")}
                    />
                    <Button type="submit" disabled={!!busy}>
                      Vincular
                    </Button>
                  </form>
                )}
              </div>
            )}

            <CaseHistory caseId={current.case} currentExecutionId={current.id} refreshKey={`${current.id}:${current.status__name}`} />

            <BugDialog
              executionId={current.id}
              open={bugOpen}
              onClose={() => setBugOpen(false)}
              onCreated={(link) => setLinks((l) => [...l, link])}
            />

            <div className="mt-auto flex items-center justify-between pt-5 text-xs text-muted">
              <Button variant="ghost" onClick={() => go(index - 1)} disabled={index === 0}>
                <ChevronLeft className="size-4" /> Anterior
              </Button>
              <span className="hidden sm:inline">
                <kbd className="rounded border border-border px-1">J</kbd>/<kbd className="rounded border border-border px-1">K</kbd> navegar
              </span>
              <Button variant="ghost" onClick={() => go(index + 1)} disabled={index === executions.length - 1}>
                Próximo <ChevronRight className="size-4" />
              </Button>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
