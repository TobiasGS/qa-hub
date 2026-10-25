// Regras de evidência compartilhadas entre servidor e navegador.
import type { LinkReference } from "../kiwi/types";

export const EVIDENCE_PATH = "/api/evidence/";
export const EVIDENCE_PREFIX = "Evidência: ";

const MB = 1024 * 1024;

export type EvidenceKind = "image" | "video" | "file";

/** Extensões aceitas, com o tipo servido e o limite de tamanho. */
export const EVIDENCE_TYPES: Record<string, { mime: string; kind: EvidenceKind; maxBytes: number }> = {
  png: { mime: "image/png", kind: "image", maxBytes: 20 * MB },
  jpg: { mime: "image/jpeg", kind: "image", maxBytes: 20 * MB },
  jpeg: { mime: "image/jpeg", kind: "image", maxBytes: 20 * MB },
  gif: { mime: "image/gif", kind: "image", maxBytes: 20 * MB },
  webp: { mime: "image/webp", kind: "image", maxBytes: 20 * MB },
  mp4: { mime: "video/mp4", kind: "video", maxBytes: 100 * MB },
  webm: { mime: "video/webm", kind: "video", maxBytes: 100 * MB },
  mov: { mime: "video/quicktime", kind: "video", maxBytes: 100 * MB },
  pdf: { mime: "application/pdf", kind: "file", maxBytes: 20 * MB },
  txt: { mime: "text/plain; charset=utf-8", kind: "file", maxBytes: 5 * MB },
  log: { mime: "text/plain; charset=utf-8", kind: "file", maxBytes: 5 * MB },
  har: { mime: "application/json", kind: "file", maxBytes: 20 * MB },
};

export const EVIDENCE_ACCEPT = Object.keys(EVIDENCE_TYPES)
  .map((ext) => `.${ext}`)
  .join(",");

export const extOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";
export const typeOf = (name: string) => EVIDENCE_TYPES[extOf(name)];

export function isEvidence(link: LinkReference) {
  return !link.is_defect && link.url.includes(EVIDENCE_PATH);
}

/** Caminho relativo (/api/evidence/...) a partir do link absoluto guardado no Kiwi. */
export function evidencePath(link: LinkReference) {
  return link.url.slice(link.url.indexOf(EVIDENCE_PATH));
}

export const evidenceName = (link: LinkReference) => (link.name.startsWith(EVIDENCE_PREFIX) ? link.name.slice(EVIDENCE_PREFIX.length) : link.name);

export function formatBytes(n: number) {
  return n >= MB ? `${(n / MB).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB` : `${Math.ceil(n / 1024)} KB`;
}
