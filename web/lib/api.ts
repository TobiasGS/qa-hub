import "server-only";
import { NextResponse } from "next/server";
import { isKiwiAuthError } from "./kiwi/rpc";
import type { User } from "./kiwi/types";
import { kiwiForApi, type KiwiContext } from "./session";

/** Erro de validação: vira HTTP 400 com a mensagem para o usuário. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

/** Cliente do Kiwi + perfil de quem chamou (para checar visibilidade). */
export type ApiContext = KiwiContext;

/**
 * Envolve uma rota /api: exige sessão, converte o retorno em JSON e os erros em
 * 400 (validação) ou 502 (o Kiwi recusou ou caiu).
 */
export function apiRoute<P extends Record<string, string | string[]> = Record<string, never>>(
  handler: (ctx: ApiContext, req: Request, params: P) => Promise<unknown>,
) {
  return async (req: Request, { params }: { params: Promise<P> }) => {
    const ctx = await kiwiForApi();
    if (!ctx) return NextResponse.json({ error: "Sessão expirada, entre de novo" }, { status: 401 });
    try {
      const result = await handler(ctx, req, await params);
      return result instanceof Response ? result : NextResponse.json(result ?? { ok: true });
    } catch (e) {
      if (isKiwiAuthError(e)) return NextResponse.json({ error: "Sessão expirada, entre de novo" }, { status: 401 });
      const status = e instanceof ApiError ? e.status : 502;
      return NextResponse.json({ error: (e as Error).message }, { status });
    }
  };
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") throw new ApiError("Corpo da requisição inválido");
  return body as Record<string, unknown>;
}

export function toId(value: unknown, field = "id"): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(`Campo inválido: ${field}`);
  return n;
}

export function toText(value: unknown, field: string, { required = false, max = 255 } = {}): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (required && !s) throw new ApiError(`Preencha o campo ${field}`);
  if (s.length > max) throw new ApiError(`${field} passou de ${max} caracteres`);
  return s;
}

/** Usuário do Kiwi correspondente a quem está logado no QA Hub. */
export async function currentUser(ctx: ApiContext): Promise<User> {
  const [me] = await ctx.kiwi.users({ username: ctx.username });
  if (!me) throw new ApiError(`Usuário ${ctx.username} não encontrado no Kiwi`, 403);
  return me;
}
