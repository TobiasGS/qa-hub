import "server-only";
import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { mockKiwi } from "./kiwi/mock";
import { isKiwiAuthError, KiwiError, realKiwi, rpc } from "./kiwi/rpc";
import type { KiwiApi } from "./kiwi/types";

export interface SessionData {
  username?: string;
  /** Valor do cookie `sessionid` do Kiwi; nunca chega ao navegador em claro. */
  kiwiSession?: string;
  /** Guardados no login; sessões antigas sem eles buscam o usuário na hora. */
  userId?: number;
  isAdmin?: boolean;
}

/** Quem está vendo e o que pode ver (veja lib/visibility.ts). */
export interface Viewer {
  username: string;
  userId: number | null;
  isAdmin: boolean;
  /** Só vale para admin: "all" vê tudo, "mine" aplica as mesmas regras de um usuário comum. */
  scope: "all" | "mine";
}

export const SCOPE_COOKIE = "qahub_scope";

export const isMock = () => process.env.KIWI_MODE === "mock";

function options(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) throw new Error("SESSION_SECRET precisa ter pelo menos 32 caracteres (veja web/.env.example)");
  return {
    password,
    cookieName: "qahub",
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 12 },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), options());
}

export interface KiwiContext {
  kiwi: KiwiApi;
  username: string;
  viewer: Viewer;
}

/**
 * Confere a sessão no Kiwi (uma chamada por request, com cache) e já traz o perfil
 * atualizado. Se o Kiwi recusar a sessão, o erro sobe e quem chamou pede login de novo.
 */
const kiwiProfile = cache(async (kiwiSession: string, username: string) => {
  const kiwi = realKiwi(kiwiSession);
  // User.filter responde até sem login; Product.filter exige sessão válida (e sem resultado com id 0).
  const [users] = await Promise.all([kiwi.users({ username }), rpc("Product.filter", [{ id: 0 }], kiwiSession)]);
  return users[0];
});

async function contextFrom(s: SessionData): Promise<KiwiContext> {
  let username = s.username!;
  const kiwi = isMock() ? mockKiwi(username) : realKiwi(s.kiwiSession!);
  let { userId, isAdmin } = s;
  if (!isMock()) {
    const me = await kiwiProfile(s.kiwiSession!, username);
    // Sessão que o Kiwi não reconhece vira "anônima": a busca volta vazia em vez de dar erro.
    if (!me) throw new KiwiError("Authentication failed: o Kiwi não reconhece mais esta sessão", -32098);
    ({ id: userId, is_superuser: isAdmin, username } = me); // nome oficial (o login aceita outra caixa)
  } else if (userId === undefined || isAdmin === undefined) {
    const [me] = await kiwi.users({ username });
    userId = me?.id;
    isAdmin = !!me?.is_superuser;
    username = me?.username ?? username;
  }
  const scope = (await cookies()).get(SCOPE_COOKIE)?.value === "mine" ? "mine" : "all";
  return { kiwi, username, viewer: { username, userId: userId ?? null, isAdmin: !!isAdmin, scope: isAdmin ? scope : "mine" } };
}

/** Para páginas: devolve o cliente do Kiwi e o perfil do usuário logado, ou manda para /login. */
export async function requireKiwi(): Promise<KiwiContext> {
  const s = await getSession();
  if (!s.username || (!isMock() && !s.kiwiSession)) redirect("/login");
  try {
    return await contextFrom(s);
  } catch (e) {
    // Sessão do Kiwi expirada: a rota limpa o cookie do QA Hub e manda para o login.
    if (isKiwiAuthError(e)) redirect("/api/auth/expired");
    throw e;
  }
}

/** Para rotas /api: igual ao requireKiwi, mas devolve null em vez de redirecionar. */
export async function kiwiForApi(): Promise<KiwiContext | null> {
  const s = await getSession();
  if (!s.username || (!isMock() && !s.kiwiSession)) return null;
  try {
    return await contextFrom(s);
  } catch (e) {
    if (isKiwiAuthError(e)) return null; // vira 401 "Sessão expirada"
    throw e;
  }
}
