import "server-only";
import { mockKiwi } from "./kiwi/mock";
import { isKiwiAuthError, login, realKiwi } from "./kiwi/rpc";
import type { KiwiApi } from "./kiwi/types";
import { isMock } from "./session";

// Kiwi do usuário técnico (KIWI_CI_USER / KIWI_CI_PASSWORD), para quem chega sem
// sessão de navegador: o pipeline de testes automatizados. A sessão fica em memória
// e o login é refeito quando o Kiwi deixa de aceitá-la.

let session: string | null = null;

export const ciUser = () => process.env.KIWI_CI_USER ?? (isMock() ? "ci-bot" : "");

export function ciConfigured() {
  return isMock() || (!!process.env.KIWI_CI_USER && !!process.env.KIWI_CI_PASSWORD);
}

/** Roda `work` com o Kiwi do usuário técnico; um login novo e uma nova tentativa se a sessão expirou. */
export async function withCiKiwi<T>(work: (kiwi: KiwiApi) => Promise<T>): Promise<T> {
  if (isMock()) return work(mockKiwi(ciUser()));
  const connect = async () => (session = await login(process.env.KIWI_CI_USER!, process.env.KIWI_CI_PASSWORD!));
  if (!session) await connect();
  try {
    return await work(realKiwi(session!));
  } catch (e) {
    if (!isKiwiAuthError(e)) throw e;
    await connect();
    return work(realKiwi(session!));
  }
}
