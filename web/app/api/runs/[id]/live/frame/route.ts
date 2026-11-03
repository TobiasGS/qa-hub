import { ApiError, apiRoute, toId } from "@/lib/api";
import { getLive } from "@/lib/live";
import { requireRunVisible } from "@/lib/visibility";

/** Último quadro (JPEG) do navegador da automação deste run. */
export const GET = apiRoute<{ id: string }>(async ({ kiwi, viewer }, _req, { id }) => {
  const runId = toId(id);
  await requireRunVisible(kiwi, viewer, runId);
  const frame = getLive(runId)?.frame;
  if (!frame) throw new ApiError("Sem imagem da automação agora", 404);
  return new Response(new Uint8Array(frame), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" } });
});
