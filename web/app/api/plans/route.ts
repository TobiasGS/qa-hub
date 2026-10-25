import { apiRoute, readJson } from "@/lib/api";
import { planInput } from "@/lib/validation";

export const POST = apiRoute(async ({ kiwi }, req) => {
  const plan = await kiwi.createPlan(await planInput(kiwi, await readJson(req)));
  return { plan };
});
