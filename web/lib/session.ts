import "server-only";
import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { mockKiwi } from "./kiwi/mock";
import { realKiwi } from "./kiwi/rpc";
import type { KiwiApi } from "./kiwi/types";

export interface SessionData {
  username?: string;
  /** Valor do cookie `sessionid` do Kiwi; nunca chega ao navegador em claro. */
  kiwiSession?: string;
}

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

/** Para páginas: devolve o cliente do Kiwi do usuário logado ou manda para /login. */
export async function requireKiwi(): Promise<{ kiwi: KiwiApi; username: string }> {
  const s = await getSession();
  if (!s.username || (!isMock() && !s.kiwiSession)) redirect("/login");
  return { kiwi: isMock() ? mockKiwi(s.username) : realKiwi(s.kiwiSession!), username: s.username };
}

/** Para rotas /api: igual ao requireKiwi, mas devolve null em vez de redirecionar. */
export async function kiwiForApi(): Promise<{ kiwi: KiwiApi; username: string } | null> {
  const s = await getSession();
  if (!s.username || (!isMock() && !s.kiwiSession)) return null;
  return { kiwi: isMock() ? mockKiwi(s.username) : realKiwi(s.kiwiSession!), username: s.username };
}
