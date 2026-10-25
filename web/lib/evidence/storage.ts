import "server-only";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

// Onde os arquivos de evidência ficam. EVIDENCE_STORAGE=local grava em
// web/.evidence (dev); EVIDENCE_STORAGE=r2 usa o bucket ligado como EVIDENCE
// no wrangler.jsonc (produção no Cloudflare).

export interface ByteRange {
  start: number;
  end?: number;
}

export interface StoredFile {
  body: ReadableStream<Uint8Array>;
  size: number;
  start: number;
  end: number;
}

export interface EvidenceStorage {
  put(key: string, body: ReadableStream<Uint8Array>, size: number, contentType: string): Promise<void>;
  get(key: string, range?: ByteRange): Promise<StoredFile | null>;
  delete(key: string): Promise<void>;
}

/** exec-<id>/<uuid>-<nome>: impede path traversal e chaves fora do padrão. */
const KEY = /^exec-\d+\/[0-9a-f-]{36}-[\w.-]{1,100}$/;
export const isValidKey = (key: string) => KEY.test(key) && !key.includes("..");

export function storage(): EvidenceStorage {
  return process.env.EVIDENCE_STORAGE === "r2" ? r2Storage() : localStorage();
}

function localStorage(): EvidenceStorage {
  const file = (key: string) => path.join(process.cwd(), ".evidence", ...key.split("/"));

  return {
    async put(key, body) {
      const target = file(key);
      await mkdir(path.dirname(target), { recursive: true });
      await pipeline(Readable.fromWeb(body as never), createWriteStream(target));
    },
    async get(key, range) {
      const info = await stat(file(key)).catch(() => null);
      if (!info) return null;
      const start = range?.start ?? 0;
      const end = Math.min(range?.end ?? info.size - 1, info.size - 1);
      const body = Readable.toWeb(createReadStream(file(key), { start, end })) as ReadableStream<Uint8Array>;
      return { body, size: info.size, start, end };
    },
    async delete(key) {
      await rm(file(key), { force: true });
    },
  };
}

/** Tipagem mínima do binding R2 (evita depender de @cloudflare/workers-types). */
interface R2Object {
  body: ReadableStream<Uint8Array>;
  size: number;
}
interface R2Bucket {
  head(key: string): Promise<{ size: number } | null>;
  put(key: string, value: ReadableStream, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string, options?: { range?: { offset: number; length?: number } }): Promise<R2Object | null>;
  delete(key: string): Promise<void>;
}
declare const FixedLengthStream: { new (length: number): TransformStream<Uint8Array, Uint8Array> } | undefined;

function r2Storage(): EvidenceStorage {
  const bucket = async () => {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const env = (await getCloudflareContext({ async: true })).env as unknown as { EVIDENCE?: R2Bucket };
    if (!env.EVIDENCE) throw new Error("Binding EVIDENCE (R2) não configurado no wrangler.jsonc");
    return env.EVIDENCE;
  };

  return {
    async put(key, body, size, contentType) {
      const b = await bucket();
      // O R2 precisa saber o tamanho de um stream; o FixedLengthStream do Workers informa.
      let value: ReadableStream = body;
      if (typeof FixedLengthStream !== "undefined") {
        const fixed = new FixedLengthStream(size);
        body.pipeTo(fixed.writable).catch(() => {});
        value = fixed.readable;
      }
      await b.put(key, value, { httpMetadata: { contentType } });
    },
    async get(key, range) {
      const b = await bucket();
      const head = await b.head(key);
      if (!head) return null;
      const start = range?.start ?? 0;
      const end = Math.min(range?.end ?? head.size - 1, head.size - 1);
      const obj = await b.get(key, { range: { offset: start, length: end - start + 1 } });
      if (!obj) return null;
      return { body: obj.body, size: obj.size, start, end };
    },
    async delete(key) {
      await (await bucket()).delete(key);
    },
  };
}
