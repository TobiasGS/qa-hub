import { apiRoute, readJson, toText } from "@/lib/api";
import { createProject } from "@/lib/projects";

/** Cria um projeto (Product no Kiwi) a partir do "+ Projeto" do formulário de plano. */
export const POST = apiRoute(async ({ kiwi }, req) => {
  const name = toText((await readJson(req)).name, "nome do projeto", { required: true, max: 64 });
  return { project: await createProject(kiwi, name) };
});
