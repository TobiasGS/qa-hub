import { ApiError } from "@/lib/api";
import { executionFor } from "@/lib/automation";
import { automationRoute } from "@/lib/automation-auth";
import { saveEvidence } from "@/lib/evidence/save";

/**
 * Evidência da automação (print e vídeo da falha), anexada à execução do caso no run.
 *   PUT /api/automation/evidence?run=15&case=19&name=TC-19-falha.png   (corpo = arquivo cru)
 */
export const PUT = automationRoute(async ({ kiwi }, req) => {
  const q = new URL(req.url).searchParams;
  const runId = Number(q.get("run"));
  const caseId = Number(q.get("case"));
  if (!Number.isInteger(runId) || runId <= 0 || !Number.isInteger(caseId) || caseId <= 0) throw new ApiError("Informe run e case");
  const execution = await executionFor(kiwi, runId, caseId);
  if (!execution) throw new ApiError(`TC-${caseId} não está no plano do run ${runId}`, 404);
  const origin = process.env.QA_HUB_URL ?? new URL(req.url).origin;
  const link = await saveEvidence(kiwi, execution.id, { name: q.get("name") ?? "", body: req.body, size: Number(req.headers.get("content-length")) }, origin);
  return { link };
});
