import { NextResponse } from "next/server";
import { KiwiError, login } from "@/lib/kiwi/rpc";
import { getSession, isMock } from "@/lib/session";

export async function POST(req: Request) {
  const { username, password } = (await req.json().catch(() => ({}))) as { username?: string; password?: string };
  if (!username || (!isMock() && !password)) return NextResponse.json({ error: "Informe usuário e senha" }, { status: 400 });

  const session = await getSession();
  try {
    session.kiwiSession = isMock() ? undefined : await login(username, password!);
  } catch (e) {
    const msg = e instanceof KiwiError && e.code !== undefined ? "Usuário ou senha inválidos" : `Não foi possível falar com o Kiwi: ${(e as Error).message}`;
    return NextResponse.json({ error: msg }, { status: 401 });
  }
  session.username = username;
  await session.save();
  return NextResponse.json({ ok: true });
}
