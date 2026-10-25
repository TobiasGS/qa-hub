import { NextResponse } from "next/server";
import { logout } from "@/lib/kiwi/rpc";
import { getSession } from "@/lib/session";

export async function POST() {
  const session = await getSession();
  if (session.kiwiSession) await logout(session.kiwiSession).catch(() => {});
  session.destroy();
  return NextResponse.json({ ok: true });
}
