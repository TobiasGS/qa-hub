import { ApiError } from "@/lib/api";
import { automationRoute } from "@/lib/automation-auth";
import { decrypt, getAutomation } from "@/lib/automation-config";

/**
 * Configuração do sistema a testar, pelo plano: URL, pasta dos testes, como é o login
 * e o usuário de teste (com a senha). Chamado pelo qa-automacao antes de rodar.
 *   GET /api/automation/config?plan=9
 */
export const GET = automationRoute(async ({ kiwi }, req) => {
  const planId = Number(new URL(req.url).searchParams.get("plan"));
  if (!Number.isInteger(planId) || planId <= 0) throw new ApiError("Informe o plano: ?plan=<id>");
  const [plan] = await kiwi.plans({ id: planId });
  if (!plan) throw new ApiError(`Plano ${planId} não encontrado`, 404);
  const config = await getAutomation(plan.product);
  if (!config || !config.passwordEnc) {
    throw new ApiError(`O projeto "${plan.product__name}" ainda não tem a automação configurada: no QA Hub, Projetos → ${plan.product__name} → Configurar automação.`, 404);
  }
  let password: string;
  try {
    password = decrypt(config.passwordEnc);
  } catch {
    throw new ApiError("Não foi possível abrir a senha guardada (a chave AUTOMATION_SECRET/SESSION_SECRET mudou?). Salve a senha de novo no QA Hub.", 500);
  }
  return {
    plan: { id: plan.id, name: plan.name },
    project: { id: plan.product, name: plan.product__name },
    baseUrl: config.baseUrl,
    folder: config.folder,
    login: config.login,
    user: config.user,
    password,
  };
});
