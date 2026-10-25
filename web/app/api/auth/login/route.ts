import { NextResponse } from "next/server";
import { mockKiwi } from "@/lib/kiwi/mock";
import { KiwiError, login, realKiwi } from "@/lib/kiwi/rpc";
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
  // Perfil: id e se é superusuário (admin vê tudo; os demais, só o que é deles).
  const kiwi = isMock() ? mockKiwi(username) : realKiwi(session.kiwiSession!);
  const [me] = await kiwi.users({ username }).catch(() => []);
  // O Kiwi aceita "tobias" para "Tobias"; guardamos o nome oficial para bater com autor/responsável.
  session.username = me?.username ?? username;
  session.userId = me?.id;
  session.isAdmin = !!me?.is_superuser;
  await session.save();
  return NextResponse.json({ ok: true });
}
