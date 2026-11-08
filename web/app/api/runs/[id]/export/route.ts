import { ApiError, apiRoute, toId } from "@/lib/api";
import { formatKiwiDate, runReport } from "@/lib/run-report";
import { formatDuration } from "@/lib/timer";
import { requireRunVisible } from "@/lib/visibility";

// CSV do run para o Excel em pt-BR: separador ";" e BOM UTF-8 (senão os acentos quebram).
const cell = (v: string | number) => {
  const s = String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const GET = apiRoute<{ id: string }>(async ({ kiwi, viewer }, _req, { id }) => {
  const runId = toId(id);
  await requireRunVisible(kiwi, viewer, runId);
  const [run] = await kiwi.runs({ id: runId });
  if (!run) throw new ApiError("Run não encontrado", 404);
  const { rows } = await runReport(kiwi, run);

  const header = ["Caso", "Título", "Requisito", "Prioridade", "Situação", "Testador", "Início", "Fim", "Duração", "Bugs"];
  const lines = rows.map((r) =>
    [
      `TC-${r.caseId}`,
      r.title,
      r.requirement,
      r.priority,
      r.status,
      r.tester,
      formatKiwiDate(r.start),
      formatKiwiDate(r.stop),
      r.duration === null ? "" : formatDuration(r.duration),
      r.bugs.map((b) => b.name || b.url).join(", "),
    ]
      .map(cell)
      .join(";"),
  );
  const csv = "﻿" + [header.join(";"), ...lines].join("\r\n") + "\r\n";
  const build = run.build__name.replace(/[^\w.-]+/g, "_");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="run-${run.id}-build-${build}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
