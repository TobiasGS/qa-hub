import { applyResults, parsePayload } from "@/lib/automation";
import { automationRoute } from "@/lib/automation-auth";
import { endLive } from "@/lib/live";
import { hubOrigin } from "@/lib/origin";

/**
 * Resultados dos testes automatizados (reporter do Playwright no pipeline).
 * Sem sessão de navegador: autentica pelo cabeçalho X-QAHub-Token e grava no Kiwi
 * com o usuário técnico (KIWI_CI_USER).
 */
export const POST = automationRoute(async ({ kiwi, ciUsername }, req) => {
  const payload = parsePayload(await req.json().catch(() => null));
  const result = await applyResults(kiwi, payload, ciUsername, hubOrigin(req));
  if (result.run) endLive(result.run); // terminou: o cartão "ao vivo" some
  return result;
});
