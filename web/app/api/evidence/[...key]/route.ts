import { NextResponse } from "next/server";
import { typeOf } from "@/lib/evidence/shared";
import { isValidKey, storage, type ByteRange } from "@/lib/evidence/storage";
import { getSession } from "@/lib/session";

/** Serve uma evidência só para quem está logado no QA Hub, com suporte a Range (vídeo). */
export async function GET(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const session = await getSession();
  if (!session.username) return NextResponse.json({ error: "Entre no QA Hub para ver a evidência" }, { status: 401 });

  const key = (await params).key.map(decodeURIComponent).join("/");
  const type = typeOf(key);
  if (!isValidKey(key) || !type) return NextResponse.json({ error: "Evidência inválida" }, { status: 400 });

  const range = parseRange(req.headers.get("range"));
  const file = await storage().get(key, range ?? undefined);
  if (!file) return NextResponse.json({ error: "Evidência não encontrada" }, { status: 404 });
  if (file.start > file.end) {
    await file.body.cancel();
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${file.size}` } });
  }

  const filename = key.split("/").pop()!.replace(/^[0-9a-f-]{36}-/, "");
  const headers = new Headers({
    "Content-Type": type.mime,
    "Content-Length": String(file.end - file.start + 1),
    "Accept-Ranges": "bytes",
    // Cache curto: num computador compartilhado, a evidência não fica muito tempo acessível depois do logout.
    "Cache-Control": "private, max-age=300",
    "Content-Disposition": `inline; filename="${filename}"`,
    "X-Content-Type-Options": "nosniff",
  });
  if (range) headers.set("Content-Range", `bytes ${file.start}-${file.end}/${file.size}`);
  return new Response(file.body, { status: range ? 206 : 200, headers });
}

function parseRange(header: string | null): ByteRange | null {
  const m = header?.match(/^bytes=(\d+)-(\d*)$/);
  if (!m) return null;
  return { start: Number(m[1]), end: m[2] ? Number(m[2]) : undefined };
}
