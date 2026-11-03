import "server-only";
import { ApiError } from "../api";
import type { KiwiApi, LinkReference } from "../kiwi/types";
import { EVIDENCE_PATH, EVIDENCE_PREFIX, formatBytes, typeOf } from "./shared";
import { storage } from "./storage";

/**
 * Grava uma evidência (arquivo cru, em stream) e a liga à execução no Kiwi.
 * Usado no anexo manual (tela de execução) e pela automação (print e vídeo da falha).
 */
export async function saveEvidence(
  kiwi: KiwiApi,
  executionId: number,
  file: { name: string; body: ReadableStream<Uint8Array> | null; size: number },
  origin: string,
): Promise<LinkReference> {
  const name = file.name.trim();
  const type = typeOf(name);
  if (!type) throw new ApiError("Tipo de arquivo não aceito. Use imagem (png, jpg, gif, webp), vídeo (mp4, webm, mov), pdf, txt, log ou har.");
  if (!file.size || !file.body) throw new ApiError("Arquivo vazio");
  if (file.size > type.maxBytes) throw new ApiError(`${name} tem ${formatBytes(file.size)}; o limite para esse tipo é ${formatBytes(type.maxBytes)}.`, 413);

  const safe = name.replace(/[^\w.-]+/g, "_").slice(-100);
  const key = `exec-${executionId}/${crypto.randomUUID()}-${safe}`;
  await storage().put(key, file.body, file.size, type.mime);
  return kiwi.addLink(executionId, { url: `${origin.replace(/\/$/, "")}${EVIDENCE_PATH}${key}`, name: `${EVIDENCE_PREFIX}${name}`, is_defect: false });
}
