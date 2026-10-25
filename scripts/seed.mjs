// Popula um Kiwi vazio com dados de exemplo pela própria API.
// Pode rodar de novo: reaproveita o que já existe pelo nome.
//   node scripts/seed.mjs
import { connect } from "./kiwi-client.mjs";

const { rpc, user } = await connect();

async function getOrCreate(entity, query, values) {
  const [found] = await rpc(`${entity}.filter`, query);
  return found ?? rpc(`${entity}.create`, values);
}

const [me] = await rpc("User.filter", { username: user });
const classification = await getOrCreate("Classification", { name: "Web" }, { name: "Web" });
const product = await getOrCreate("Product", { name: "Loja Web" }, { name: "Loja Web", classification: classification.id, description: "Exemplo do QA Hub" });
const version = await getOrCreate("Version", { product: product.id, value: "1.x" }, { product: product.id, value: "1.x" });

const [category] = await rpc("Category.filter", { product: product.id });
const [confirmed] = await rpc("TestCaseStatus.filter", { name: "CONFIRMED" });
const priorities = await rpc("Priority.filter", {});
const [planType] = await rpc("PlanType.filter", { name: "Function" });
const statuses = await rpc("TestExecutionStatus.filter", {});
const status = (name) => statuses.find((s) => s.name === name).id;

const PLANS = {
  Checkout: [
    ["SHOP-101", "Finalizar compra com cartão de crédito"],
    ["SHOP-101", "Finalizar compra com Pix"],
    ["SHOP-102", "Aplicar cupom de desconto válido"],
    ["SHOP-103", "Calcular frete por CEP"],
  ],
  "Cadastro e Login": [
    ["SHOP-201", "Cadastrar usuário com e-mail"],
    ["SHOP-202", "Login com senha correta"],
    ["SHOP-202", "Bloquear após 5 tentativas erradas"],
  ],
};

const builds = [];
for (const name of ["1.6.0", "1.7.0", "1.8.0"]) {
  builds.push(await getOrCreate("Build", { name, version: version.id }, { name, version: version.id }));
}

for (const [planName, cases] of Object.entries(PLANS)) {
  const plan = await getOrCreate(
    "TestPlan",
    { name: planName, product: product.id },
    { name: planName, product: product.id, product_version: version.id, type: planType.id, text: `Plano de exemplo: ${planName}`, is_active: true },
  );

  const caseIds = [];
  for (const [requirement, summary] of cases) {
    const tc = await getOrCreate(
      "TestCase",
      { summary },
      {
        summary,
        requirement,
        category: category.id,
        priority: priorities[0].id,
        case_status: confirmed.id,
        is_automated: false,
        text: "1. Abrir a loja\n2. Executar o fluxo\n\n**Resultado esperado:** fluxo concluído sem erros.",
      },
    );
    await rpc("TestPlan.add_case", plan.id, tc.id).catch(() => {});
    caseIds.push(tc.id);
  }

  for (const [bi, build] of builds.entries()) {
    const summary = `${planName} — Manual — ${build.name}`;
    const [existing] = await rpc("TestRun.filter", { summary });
    if (existing) continue;
    const run = await rpc("TestRun.create", { plan: plan.id, build: build.id, manager: me.id, default_tester: me.id, summary });
    for (const [ci, caseId] of caseIds.entries()) {
      const [execution] = await rpc("TestRun.add_case", run.id, caseId);
      // Última build fica pela metade; nas outras, um caso falha de vez em quando.
      const isLatest = bi === builds.length - 1;
      if (isLatest && ci >= caseIds.length / 2) continue;
      const result = (ci + bi) % 4 === 3 ? "FAILED" : "PASSED";
      await rpc("TestExecution.update", execution.id, { status: status(result) });
    }
    if (bi < builds.length - 1) await rpc("TestRun.update", run.id, { stop_date: new Date().toISOString().slice(0, 19).replace("T", " ") });
    console.log(`run #${run.id} ${summary}`);
  }
}

console.log("✅ Seed concluído.");
