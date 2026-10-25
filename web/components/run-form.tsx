"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Build, TestCase, TestPlan, TestRun, User } from "@/lib/kiwi/types";
import { send } from "@/lib/client-api";
import { Field, FormFooter, Select, TextInput } from "./form";
import { Badge, Card, cn, inputStyles } from "./ui";

const NEW_BUILD = "__new";

export function RunForm({ plan, cases, builds, users, me }: { plan: TestPlan; cases: TestCase[]; builds: Build[]; users: User[]; me: number | null }) {
  const router = useRouter();
  const sortedBuilds = [...builds].sort((a, b) => b.id - a.id);
  const [build, setBuild] = useState(sortedBuilds[0] ? String(sortedBuilds[0].id) : NEW_BUILD);
  const [newBuild, setNewBuild] = useState("");
  const buildName = build === NEW_BUILD ? newBuild : (sortedBuilds.find((b) => String(b.id) === build)?.name ?? "");
  const [summary, setSummary] = useState("");
  const [tester, setTester] = useState(me ? String(me) : "");
  const [selected, setSelected] = useState<Set<number>>(new Set(cases.map((c) => c.id)));
  const [assignees, setAssignees] = useState<Record<number, string>>({});
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priorities = [...new Set(cases.map((c) => c.priority__value))];
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cases.filter(
      (c) => (!priority || c.priority__value === priority) && (!q || c.summary.toLowerCase().includes(q) || (c.requirement ?? "").toLowerCase().includes(q) || `tc-${c.id}`.includes(q)),
    );
  }, [cases, query, priority]);
  const allVisibleSelected = visible.length > 0 && visible.every((c) => selected.has(c.id));
  const userOptions = users.map((u) => ({ value: String(u.id), label: u.username }));

  function toggle(id: number) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleVisible() {
    setSelected((s) => {
      const next = new Set(s);
      for (const c of visible) {
        if (allVisibleSelected) next.delete(c.id);
        else next.add(c.id);
      }
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { run } = await send<{ run: TestRun }>("/api/runs", "POST", {
        plan: plan.id,
        build: build === NEW_BUILD ? undefined : Number(build),
        newBuild: build === NEW_BUILD ? newBuild : undefined,
        summary: summary.trim() || `${plan.name} — ${buildName}`,
        default_tester: tester ? Number(tester) : null,
        cases: cases.filter((c) => selected.has(c.id)).map((c) => ({ id: c.id, assignee: assignees[c.id] ? Number(assignees[c.id]) : null })),
      });
      router.push(`/runs/${run.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 lg:grid-cols-[340px_1fr]">
      <Card className="h-fit space-y-4 p-5">
        <Field label="Build">
          <Select
            value={build}
            onChange={(e) => setBuild(e.target.value)}
            options={[...sortedBuilds.map((b) => ({ value: String(b.id), label: b.name })), { value: NEW_BUILD, label: "+ Nova build…" }]}
          />
        </Field>
        {build === NEW_BUILD && (
          <Field label="Nome da nova build" hint={`Projeto ${plan.product__name}`}>
            <TextInput value={newBuild} onChange={(e) => setNewBuild(e.target.value)} required placeholder="Ex.: 1.9.0-rc1" autoFocus />
          </Field>
        )}
        <Field label="Título do run">
          <TextInput value={summary} onChange={(e) => setSummary(e.target.value)} placeholder={`${plan.name} — ${buildName || "build"}`} maxLength={255} />
        </Field>
        <Field label="Testador padrão" hint="Quem recebe os casos sem responsável próprio.">
          <Select value={tester} onChange={(e) => setTester(e.target.value)} options={[{ value: "", label: "Ninguém" }, ...userOptions]} />
        </Field>
        <div className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-fg-2">
          <b className="text-fg tabular">{selected.size}</b> de {cases.length} casos selecionados
        </div>
        <FormFooter busy={busy} error={error} submitLabel="Criar run" onCancel={() => router.back()} />
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <label className="flex items-center gap-2 px-2 text-sm">
            <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} className="size-4 accent-[var(--accent)]" aria-label="Selecionar todos os visíveis" />
          </label>
          <div className="relative min-w-40 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted" aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por título, TC-id ou card" className={cn(inputStyles, "w-full pl-8")} />
          </div>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputStyles} aria-label="Prioridade">
            <option value="">Prioridade: todas</option>
            {priorities.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
        <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto">
          {visible.map((c) => (
            <li key={c.id} className={cn("flex flex-wrap items-center gap-3 px-5 py-2.5", !selected.has(c.id) && "opacity-60")}>
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="size-4 shrink-0 accent-[var(--accent)]" />
                <span className="min-w-0">
                  <span className="block truncate text-sm">
                    <span className="text-muted tabular">TC-{c.id}</span> {c.summary}
                  </span>
                  <span className="mt-0.5 flex gap-1.5">
                    <Badge>{c.priority__value}</Badge>
                    {c.requirement && <Badge>{c.requirement}</Badge>}
                  </span>
                </span>
              </label>
              <select
                value={assignees[c.id] ?? ""}
                onChange={(e) => setAssignees((a) => ({ ...a, [c.id]: e.target.value }))}
                disabled={!selected.has(c.id)}
                className={cn(inputStyles, "h-8 w-40 text-xs")}
                aria-label={`Responsável por ${c.summary}`}
              >
                <option value="">Testador padrão</option>
                {userOptions.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </li>
          ))}
          {visible.length === 0 && <li className="px-5 py-8 text-center text-sm text-muted">Nenhum caso com esse filtro.</li>}
        </ul>
      </Card>
    </form>
  );
}
