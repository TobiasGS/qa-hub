import "server-only";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ApiError } from "./api";
import { ciConfigured, ciUser, withCiKiwi } from "./ci-kiwi";
import type { KiwiApi } from "./kiwi/types";

/** Token do pipeline (AUTOMATION_TOKEN), comparado em tempo constante. */
function tokenOk(given: string | null) {
  const expected = process.env.AUTOMATION_TOKEN;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Rotas /api/automation/*: chamadas pelo reporter do Playwright, sem sessão de navegador.
 * Autentica pelo cabeçalho X-QAHub-Token e entrega o Kiwi do usuário técnico (KIWI_CI_USER).
 */
export function automationRoute(handler: (ctx: { kiwi: KiwiApi; ciUsername: string }, req: Request) => Promise<unknown>) {
  return async (req: Request) => {
    if (!process.env.AUTOMATION_TOKEN || !ciConfigured()) {
      return NextResponse.json({ error: "Automação não configurada no QA Hub: defina AUTOMATION_TOKEN, KIWI_CI_USER e KIWI_CI_PASSWORD." }, { status: 503 });
    }
    if (!tokenOk(req.headers.get("x-qahub-token"))) return NextResponse.json({ error: "Token inválido (X-QAHub-Token)" }, { status: 401 });
    try {
      const result = await withCiKiwi((kiwi) => handler({ kiwi, ciUsername: ciUser() }, req));
      return result instanceof Response ? result : NextResponse.json(result ?? { ok: true });
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 502;
      return NextResponse.json({ error: (e as Error).message }, { status });
    }
  };
}
