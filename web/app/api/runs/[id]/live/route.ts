import { apiRoute, toId } from "@/lib/api";
import { getLive } from "@/lib/live";
import { requireRunVisible } from "@/lib/visibility";

/** Automação ao vivo deste run (para a tela): caso e passo atuais e se há quadro. */
export const GET = apiRoute<{ id: string }>(async ({ kiwi, viewer }, _req, { id }) => {
  const runId = toId(id);
  await requireRunVisible(kiwi, viewer, runId);
  const live = getLive(runId);
  return live
    ? { active: true, caseId: live.caseId, title: live.title, step: live.step, status: live.status, updatedAt: live.updatedAt, frameAt: live.frameAt || null }
    : { active: false };
});
