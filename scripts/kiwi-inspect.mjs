// Confere, no Kiwi que está rodando, os métodos e campos que o QA Hub usa.
// Rode sempre que atualizar a imagem do Kiwi:
//   node scripts/kiwi-inspect.mjs
import { connect } from "./kiwi-client.mjs";

const { rpc } = await connect();

const USED = [
  "Auth.login",
  "Auth.logout",
  "Product.filter",
  "Product.create",
  "Classification.filter",
  "Classification.create",
  "Version.create",
  "Category.create",
  "PlanType.create",
  "Version.filter",
  "Build.filter",
  "Build.create",
  "PlanType.filter",
  "Category.filter",
  "Priority.filter",
  "TestCaseStatus.filter",
  "User.filter",
  "TestPlan.filter",
  "TestPlan.create",
  "TestPlan.update",
  "TestPlan.add_case",
  "TestPlan.remove_case",
  "TestRun.filter",
  "TestRun.create",
  "TestRun.add_case",
  "TestCase.filter",
  "TestCase.create",
  "TestCase.update",
  "TestExecution.filter",
  "TestExecution.update",
  "TestExecution.add_comment",
  "TestExecution.get_comments",
  "TestExecution.add_link",
  "TestExecution.get_links",
  "TestExecution.remove_link",
  "TestExecutionStatus.filter",
  "Bug.report",
];

const methods = await rpc("system.listMethods").catch(() => null);
if (methods) {
  const missing = USED.filter((m) => !methods.includes(m));
  console.log(missing.length ? `❌ Métodos ausentes: ${missing.join(", ")}` : `✅ Todos os ${USED.length} métodos usados existem.`);
} else {
  console.log("⚠️  system.listMethods não disponível; pulando a checagem de métodos.");
}

// Campos que o QA Hub lê de cada entidade (web/lib/kiwi/types.ts).
const FIELDS = {
  "TestPlan.filter": ["id", "name", "text", "is_active", "extra_link", "product", "product__name", "product_version", "product_version__value", "author__username", "type", "type__name"],
  "TestRun.filter": ["id", "summary", "plan", "plan__name", "build", "build__name", "manager__username", "default_tester__username", "start_date", "stop_date"],
  "TestCase.filter": ["id", "summary", "requirement", "is_automated", "case_status", "case_status__name", "category", "priority", "priority__value", "text"],
  "TestExecution.filter": ["id", "run", "case", "case__summary", "build", "build__name", "status", "status__name", "assignee", "assignee__username", "tested_by__username", "start_date", "stop_date", "sortkey"],
  "Version.filter": ["id", "value", "product"],
  "Build.filter": ["id", "name", "version", "is_active"],
  "Category.filter": ["id", "name", "product"],
  "Priority.filter": ["id", "value"],
  "TestCaseStatus.filter": ["id", "name"],
  "User.filter": ["id", "username"],
  "TestExecutionStatus.filter": ["id", "name", "weight"],
  "TestExecution.get_links": ["id", "execution", "name", "url", "is_defect", "created_on"],
};

for (const [method, fields] of Object.entries(FIELDS)) {
  const rows = await rpc(method, {});
  if (!rows.length) {
    console.log(`·  ${method}: sem registros para conferir (rode o seed).`);
    continue;
  }
  const missing = fields.filter((f) => !(f in rows[0]));
  console.log(missing.length ? `❌ ${method}: faltam ${missing.join(", ")}` : `✅ ${method}: campos ok`);
  if (missing.length) console.log("   campos disponíveis:", Object.keys(rows[0]).join(", "));
}
