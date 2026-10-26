import { getSession } from "@/lib/session";

/** O Kiwi recusou a sessão: limpa o cookie do QA Hub e volta para o login com o aviso. */
export async function GET() {
  const session = await getSession();
  session.destroy();
  // Location relativo: funciona igual em localhost e no endereço público (atrás do Tunnel).
  return new Response(null, { status: 307, headers: { Location: "/login?expirou=1", "Cache-Control": "no-store" } });
}
