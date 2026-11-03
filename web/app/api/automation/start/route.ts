import { ApiError, readJson } from "@/lib/api";
import { resolveRun } from "@/lib/automation";
import { automationRoute } from "@/lib/automation-auth";
import { updateLive } from "@/lib/live";
import { hubOrigin } from "@/lib/origin";

/**
 * Início da automação: acha ou cria o run (o escolhido ou o "· automatizado" da build)
 * antes de os testes rodarem, para dar para assistir ao vivo. Corpo: { plan, build, run? }.
 */
export const POST = automationRoute(async ({ kiwi, ciUsername }, req) => {
  const raw = await readJson(req);
  const plan = Number(raw.plan);
  const build = String(raw.build ?? "").trim().slice(0, 255);
  const run = raw.run ? Number(raw.run) : undefined;
  if (!Number.isInteger(plan) || plan <= 0) throw new ApiError("Campo inválido: plan");
  if (!build) throw new ApiError("Campo inválido: build");
  if (run !== undefined && (!Number.isInteger(run) || run <= 0)) throw new ApiError("Campo inválido: run");
  const { run: target } = await resolveRun(kiwi, { plan, build, run }, ciUsername);
  updateLive(target.id, { step: "Iniciando a automação…" });
  return { run: target.id, url: `${hubOrigin(req)}/runs/${target.id}` };
});
