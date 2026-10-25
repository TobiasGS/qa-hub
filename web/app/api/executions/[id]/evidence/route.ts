import { ApiError, apiRoute, toId } from "@/lib/api";
import { requireExecutionVisible } from "@/lib/visibility";
import { EVIDENCE_PATH, EVIDENCE_PREFIX, evidencePath, formatBytes, isEvidence, typeOf } from "@/lib/evidence/shared";
import { isValidKey, storage } from "@/lib/evidence/storage";

/**
 * Envia uma evidência. O corpo é o arquivo cru (não multipart), para ir em
 * stream até o armazenamento sem carregar tudo na memória.
 *   PUT /api/executions/12/evidence?name=print.png
 */
export const PUT = apiRoute<{ id: string }>(async ({ kiwi, viewer }, req, { id }) => {
  const executionId = toId(id);
  await requireExecutionVisible(kiwi, viewer, executionId);
  const name = new URL(req.url).searchParams.get("name")?.trim() ?? "";
  const type = typeOf(name);
  if (!type) throw new ApiError("Tipo de arquivo não aceito. Use imagem (png, jpg, gif, webp), vídeo (mp4, webm, mov), pdf, txt, log ou har.");
  const size = Number(req.headers.get("content-length"));
  if (!size || !req.body) throw new ApiError("Arquivo vazio");
  if (size > type.maxBytes) throw new ApiError(`${name} tem ${formatBytes(size)}; o limite para esse tipo é ${formatBytes(type.maxBytes)}.`, 413);

  const [execution] = await kiwi.executions({ id: executionId });
  if (!execution) throw new ApiError("Execução não encontrada", 404);

  const safe = name.replace(/[^\w.-]+/g, "_").slice(-100);
  const key = `exec-${executionId}/${crypto.randomUUID()}-${safe}`;
  await storage().put(key, req.body, size, type.mime);

  const origin = (process.env.QA_HUB_URL ?? new URL(req.url).origin).replace(/\/$/, "");
  const link = await kiwi.addLink(executionId, { url: `${origin}${EVIDENCE_PATH}${key}`, name: `${EVIDENCE_PREFIX}${name}`, is_defect: false });
  return { link };
});

/** Remove a evidência: o arquivo e o link na execução.  DELETE ...?link=<id> */
export const DELETE = apiRoute<{ id: string }>(async ({ kiwi, viewer }, req, { id }) => {
  const executionId = toId(id);
  await requireExecutionVisible(kiwi, viewer, executionId);
  const linkId = toId(new URL(req.url).searchParams.get("link"), "link");
  const [link] = await kiwi.links({ id: linkId, execution: executionId });
  if (!link || !isEvidence(link)) throw new ApiError("Evidência não encontrada", 404);

  const key = evidencePath(link).slice(EVIDENCE_PATH.length);
  if (isValidKey(key)) await storage().delete(key);
  await kiwi.removeLink(link.id);
});
