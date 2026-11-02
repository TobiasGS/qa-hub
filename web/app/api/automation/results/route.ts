import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api";
import { applyResults, parsePayload } from "@/lib/automation";
import { ciConfigured, ciUser, withCiKiwi } from "@/lib/ci-kiwi";
import { hubOrigin } from "@/lib/origin";

/** Token do pipeline (AUTOMATION_TOKEN), comparado em tempo constante. */
function tokenOk(given: string | null) {
  const expected = process.env.AUTOMATION_TOKEN;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Resultados dos testes automatizados (reporter do Playwright no pipeline).
 * Sem sessão de navegador: autentica pelo cabeçalho X-QAHub-Token e grava no Kiwi
 * com o usuário técnico (KIWI_CI_USER).
 */
export async function POST(req: Request) {
  if (!process.env.AUTOMATION_TOKEN || !ciConfigured()) {
    return NextResponse.json({ error: "Automação não configurada no QA Hub: defina AUTOMATION_TOKEN, KIWI_CI_USER e KIWI_CI_PASSWORD." }, { status: 503 });
  }
  if (!tokenOk(req.headers.get("x-qahub-token"))) return NextResponse.json({ error: "Token inválido (X-QAHub-Token)" }, { status: 401 });
  try {
    const payload = parsePayload(await req.json().catch(() => null));
    const result = await withCiKiwi((kiwi) => applyResults(kiwi, payload, ciUser(), hubOrigin(req)));
    return NextResponse.json(result);
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 502;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
