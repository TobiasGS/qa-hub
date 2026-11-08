import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { formatRate } from "@/components/status";
import type { Outcome } from "@/lib/metrics";
import { formatKiwiDate, runReport } from "@/lib/run-report";
import { requireKiwi } from "@/lib/session";
import { formatDuration } from "@/lib/timer";
import { canSeeRun, visibleSet } from "@/lib/visibility";

// Relatório do run para imprimir ou salvar em PDF: fora do layout do app (sem menu),
// sempre claro, em A4.

export const metadata: Metadata = { title: "Relatório do run · QA Hub" };

const COLOR: Record<Outcome, string> = { passed: "#0a7f0a", failed: "#a32929", blocked: "#b4541c", pending: "#6f6d68" };

export default async function RunReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { kiwi, viewer } = await requireKiwi();
  const id = Number((await params).id);
  const [run] = await kiwi.runs({ id });
  if (!run || !canSeeRun(await visibleSet(kiwi, viewer), run.id)) notFound();
  const { plan, summary: s, rows, bugs, diagnosis } = await runReport(kiwi, run);
  const generated = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

  return (
    <div className="report mx-auto max-w-[210mm] px-8 py-8 text-[13px] leading-snug">
      <style>{`
        html, body { background: #fff !important; color: #111 !important; color-scheme: light; }
        .report table { border-collapse: collapse; width: 100%; }
        .report th, .report td { border-bottom: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; }
        .report th { font-size: 11px; color: #555; font-weight: 600; }
        .report tr { break-inside: avoid; }
        @page { size: A4; margin: 14mm; }
        @media print { .report { padding: 0; max-width: none; } }
      `}</style>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-[#555]">QA Hub · Relatório do run #{run.id}</p>
          <h1 className="mt-1 text-xl font-semibold">{run.summary}</h1>
          <p className="mt-1 text-[#444]">
            Plano {run.plan__name} · build {run.build__name}
            {plan?.extra_link ? ` · card ${plan.extra_link}` : ""}
          </p>
          <p className="text-[#444]">
            Início {formatKiwiDate(run.start_date) || "—"} · {run.stop_date ? `concluído em ${formatKiwiDate(run.stop_date)}` : "em andamento"}
          </p>
        </div>
        <PrintButton />
      </div>

      <section className="mb-6 grid grid-cols-5 gap-2 text-center">
        <Stat label="Sucesso" value={formatRate(s.passRate)} />
        <Stat label="Passou" value={s.passed} color={COLOR.passed} />
        <Stat label="Falhou" value={s.failed} color={COLOR.failed} />
        <Stat label="Bloqueado" value={s.blocked} color={COLOR.blocked} />
        <Stat label="Pendente" value={s.pending} color={COLOR.pending} />
      </section>
      <p className="mb-6 text-[#444]">
        {s.executed} de {s.total} casos executados · {bugs.length} {bugs.length === 1 ? "bug" : "bugs"}
      </p>

      {diagnosis && (
        <section className="mb-6 rounded-lg border border-[#ddd] p-4">
          <h2 className="mb-1 font-semibold">Diagnóstico das falhas (IA)</h2>
          {diagnosis.summary && <p className="mb-2 text-[#333]">{diagnosis.summary}</p>}
          <ul className="list-disc pl-5 text-[#333]">
            {diagnosis.groups.map((g) => (
              <li key={g.title}>
                <b>{g.title}</b> ({g.executions.length} {g.executions.length === 1 ? "caso" : "casos"}) — {g.action}
              </li>
            ))}
          </ul>
        </section>
      )}

      <table>
        <thead>
          <tr>
            <th>Caso</th>
            <th>Prioridade</th>
            <th>Situação</th>
            <th>Testador</th>
            <th>Duração</th>
            <th>Bugs</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.caseId}>
              <td>
                <span className="text-[#666]">TC-{r.caseId}</span> {r.title}
                {r.requirement && <span className="block text-[11px] text-[#666]">{r.requirement}</span>}
              </td>
              <td>{r.priority}</td>
              <td style={{ color: COLOR[r.outcome], fontWeight: 600 }}>{r.status}</td>
              <td>{r.tester || "—"}</td>
              <td className="whitespace-nowrap">{r.duration === null ? "—" : formatDuration(r.duration)}</td>
              <td>
                {r.bugs.length === 0
                  ? "—"
                  : r.bugs.map((b) => (
                      <a key={b.id} href={b.url} className="block text-[#1f6bc4] underline">
                        {b.name || "bug"}
                      </a>
                    ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-6 text-[11px] text-[#777]">Gerado em {generated} por {viewer.username}.</p>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="rounded-lg border border-[#ddd] px-2 py-3">
      <p className="text-xl font-semibold" style={color ? { color } : undefined}>
        {value}
      </p>
      <p className="text-[11px] text-[#555]">{label}</p>
    </div>
  );
}
