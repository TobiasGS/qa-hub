import "server-only";
import type {
  Build,
  CaseStatus,
  Classification,
  Category,
  Comment,
  ExecutionStatus,
  KiwiApi,
  LinkReference,
  PlanType,
  Priority,
  Product,
  Query,
  TestCase,
  TestExecution,
  TestPlan,
  TestRun,
  User,
  Version,
} from "./types";

// Dados de exemplo que imitam a JSON-RPC do Kiwi (KIWI_MODE=mock). Servem para
// desenvolver e demonstrar o QA Hub sem um Kiwi rodando. As alterações ficam em
// memória e somem quando o servidor reinicia.

const STATUSES: ExecutionStatus[] = [
  { id: 1, name: "IDLE", weight: 0, icon: "fa fa-question-circle-o", color: "#72767b" },
  { id: 2, name: "RUNNING", weight: 0, icon: "fa fa-play-circle-o", color: "#0099d3" },
  { id: 3, name: "PAUSED", weight: 0, icon: "fa fa-pause-circle-o", color: "#7dc3e8" },
  { id: 4, name: "PASSED", weight: 20, icon: "fa fa-check-circle-o", color: "#92d400" },
  { id: 5, name: "FAILED", weight: -10, icon: "fa fa-times-circle-o", color: "#cc0000" },
  { id: 6, name: "BLOCKED", weight: -10, icon: "fa fa-stop-circle-o", color: "#cc0000" },
  { id: 7, name: "ERROR", weight: -10, icon: "fa fa-minus-circle", color: "#cc0000" },
  { id: 8, name: "WAIVED", weight: 10, icon: "fa fa-commenting-o", color: "#92d400" },
];
const PLAN_TYPES: PlanType[] = [
  { id: 1, name: "Manual" },
  { id: 2, name: "Automatizado" },
];
const PRIORITIES: Priority[] = [
  { id: 1, value: "Alta" },
  { id: 2, value: "Média" },
  { id: 3, value: "Baixa" },
];
const CASE_STATUSES: CaseStatus[] = [
  { id: 1, name: "PROPOSED" },
  { id: 2, name: "CONFIRMED" },
  { id: 3, name: "DISABLED" },
  { id: 4, name: "NEED_UPDATE" },
];
const nameOf = <T extends { id: number }>(rows: T[], id: number, key: keyof T) => String(rows.find((r) => r.id === id)?.[key] ?? "");

// PRNG determinístico para os dados serem sempre os mesmos.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** No Kiwi caso e plano são N:N; aqui guardamos a lista de planos no próprio caso. */
type MockCase = TestCase & { plans: number[] };

interface Db {
  classifications: Classification[];
  planTypes: PlanType[];
  products: Product[];
  versions: Version[];
  categories: Category[];
  users: User[];
  builds: Build[];
  plans: TestPlan[];
  cases: MockCase[];
  runs: TestRun[];
  executions: TestExecution[];
  links: LinkReference[];
  comments: Comment[];
  seq: number;
}

const PLAN_CASES: Record<string, [string, string, number][]> = {
  Checkout: [
    ["SHOP-101", "Finalizar compra com cartão de crédito", 1],
    ["SHOP-101", "Finalizar compra com Pix", 1],
    ["SHOP-102", "Aplicar cupom de desconto válido", 2],
    ["SHOP-102", "Rejeitar cupom expirado", 2],
    ["SHOP-103", "Calcular frete por CEP", 1],
    ["SHOP-103", "Exibir erro para CEP inválido", 3],
    ["SHOP-104", "Alterar quantidade no carrinho", 2],
  ],
  "Cadastro e Login": [
    ["SHOP-201", "Cadastrar usuário com e-mail", 1],
    ["SHOP-201", "Impedir cadastro com e-mail duplicado", 2],
    ["SHOP-202", "Login com senha correta", 1],
    ["SHOP-202", "Bloquear após 5 tentativas erradas", 1],
    ["SHOP-203", "Recuperar senha por e-mail", 2],
    ["", "Logout limpa a sessão", 3],
  ],
  Busca: [
    ["SHOP-301", "Buscar produto por nome", 1],
    ["SHOP-301", "Buscar com erro de digitação", 2],
    ["SHOP-302", "Filtrar por faixa de preço", 2],
    ["SHOP-302", "Ordenar por mais vendidos", 3],
    ["SHOP-303", "Paginação dos resultados", 3],
  ],
  "Regressão Mobile": [
    ["SHOP-401", "Menu lateral abre e fecha", 2],
    ["SHOP-401", "Carrinho persiste após recarregar", 1],
    ["SHOP-402", "Layout do checkout em 375px", 1],
    ["SHOP-402", "Teclado numérico no campo CEP", 3],
  ],
};

const TESTERS = ["ana.souza", "bruno.lima", "carla.dias", "diego.reis"];
// Casos que tendem a falhar, para o "top falhas" ter algo a mostrar.
const FLAKY = new Set(["Calcular frete por CEP", "Bloquear após 5 tentativas erradas", "Layout do checkout em 375px", "Finalizar compra com Pix"]);
const CASE_TEXT = "1. Abrir a loja\n2. Executar o fluxo\n\n**Resultado esperado:** fluxo concluído sem erros.";

// Projeto de cada plano de exemplo (Product no Kiwi) e o tipo do plano.
const PLAN_PROJECT: Record<string, number> = { Checkout: 1, "Cadastro e Login": 1, Busca: 1, "Regressão Mobile": 2 };
const PLAN_TYPE: Record<string, number> = { Checkout: 1, "Cadastro e Login": 1, Busca: 2, "Regressão Mobile": 1 };
const PROJECT_BUILDS: Record<number, string[]> = { 1: ["1.4.0", "1.5.0", "1.6.0", "1.7.0", "1.8.0"], 2: ["3.0.0", "3.1.0", "3.2.0", "3.3.0", "3.4.0"] };

function seed(): Db {
  const rand = mulberry32(42);
  const db: Db = {
    classifications: [{ id: 1, name: "Projetos" }],
    planTypes: clonePlanTypes(),
    products: [
      { id: 1, name: "Loja Web" },
      { id: 2, name: "App Mobile" },
    ],
    versions: [
      { id: 1, value: "unspecified", product: 1 },
      { id: 2, value: "unspecified", product: 2 },
    ],
    categories: [
      { id: 1, name: "--default--", product: 1 },
      { id: 2, name: "--default--", product: 2 },
    ],
    // ana.souza é a admin dos dados de exemplo; quem entra com outro nome é usuário comum.
    users: [...TESTERS, "ci-bot"].map((username, i) => ({ id: i + 1, username, is_superuser: username === "ana.souza" })),
    builds: [],
    plans: [],
    cases: [],
    runs: [],
    executions: [],
    links: [],
    comments: [],
    seq: 1000,
  };
  const userId = (username: string | null) => db.users.find((u) => u.username === username)?.id ?? null;

  // Cada projeto tem sua versão "unspecified" (id = id do projeto) e suas builds.
  let buildId = 1;
  for (const [project, names] of Object.entries(PROJECT_BUILDS)) {
    names.forEach((name, i) => db.builds.push({ id: buildId++, name, version: Number(project), version__value: "unspecified", is_active: i >= 3 }));
  }
  const buildsOf = (version: number) => db.builds.filter((b) => b.version === version);

  // Cards de exemplo: Checkout ligado a um card do Azure, Cadastro a um épico do Jira.
  const PLAN_CARD: Record<string, string> = { Checkout: "AB#86", "Cadastro e Login": "SHOP-200" };

  let caseId = 1;
  Object.entries(PLAN_CASES).forEach(([name, cases], pi) => {
    const planId = pi + 1;
    const project = PLAN_PROJECT[name];
    const type = PLAN_TYPE[name];
    db.plans.push({
      id: planId,
      name,
      text: `Plano de testes de ${name.toLowerCase()}.`,
      is_active: true,
      create_date: "2026-06-02T12:00:00",
      extra_link: PLAN_CARD[name] ?? null,
      product: project,
      product__name: nameOf(db.products, project, "name"),
      product_version: project,
      product_version__value: "unspecified",
      author__username: TESTERS[pi % TESTERS.length],
      type,
      type__name: nameOf(PLAN_TYPES, type, "name"),
    });
    for (const [req, summary, priority] of cases) {
      db.cases.push({
        id: caseId++,
        plans: [planId],
        summary,
        requirement: req || null,
        is_automated: rand() > 0.4,
        case_status: 2,
        case_status__name: "CONFIRMED",
        category: project,
        category__name: "--default--",
        priority,
        priority__value: nameOf(PRIORITIES, priority, "value"),
        author__username: TESTERS[pi % TESTERS.length],
        text: CASE_TEXT,
      });
    }
  });

  let runId = 1;
  let execId = 1;
  const cycles = PROJECT_BUILDS[1].length;
  for (let bi = 0; bi < cycles; bi++) {
    const isLatest = bi === cycles - 1;
    const day = new Date(Date.UTC(2026, 6, 1 + bi * 14));
    for (const plan of db.plans) {
      const build = buildsOf(plan.product_version)[bi];
      // Plano automatizado só tem runs do Cypress; plano manual, só runs manuais.
      for (const kind of plan.type === 2 ? (["Cypress"] as const) : (["Manual"] as const)) {
        const start = new Date(day.getTime() + (plan.id + (kind === "Cypress" ? 0 : 1)) * 3600_000);
        const run: TestRun = {
          id: runId++,
          summary: `${plan.name} — ${kind} — ${build.name}`,
          plan: plan.id,
          plan__name: plan.name,
          build: build.id,
          build__name: build.name,
          manager__username: plan.author__username,
          default_tester__username: kind === "Cypress" ? "ci-bot" : TESTERS[plan.id % TESTERS.length],
          start_date: start.toISOString(),
          stop_date: isLatest && kind === "Manual" ? null : new Date(start.getTime() + 2 * 3600_000).toISOString(),
          planned_start: null,
          planned_stop: null,
          notes: kind === "Cypress" ? "Importado pelo tcms-junit.xml-plugin" : "",
        };
        db.runs.push(run);

        const cases = db.cases.filter((c) => c.plans.includes(plan.id) && (kind === "Manual" || c.is_automated));
        cases.forEach((c, ci) => {
          // Builds mais novas passam mais; o run manual da build atual está pela metade.
          let status: number;
          const r = rand();
          if (isLatest && kind === "Manual" && ci >= Math.ceil(cases.length / 2)) status = 1;
          else if (FLAKY.has(c.summary) && r < 0.55 - bi * 0.05) status = 5;
          else if (r < 0.12 - bi * 0.015) status = 5;
          else if (r < 0.16 - bi * 0.015) status = 6;
          else status = 4;
          const tester = status === 1 ? null : run.default_tester__username;
          // Tempo efetivo: Cypress leva segundos, manual de 2 a 15 minutos.
          const seconds = kind === "Cypress" ? 5 + Math.round(rand() * 40) : 120 + Math.round(rand() * 780);
          const execStart = new Date(new Date(run.start_date!).getTime() + ci * 16 * 60_000);
          db.executions.push({
            id: execId++,
            run: run.id,
            case: c.id,
            case__summary: c.summary,
            build: build.id,
            build__name: build.name,
            status,
            status__name: nameOf(STATUSES, status, "name"),
            assignee: userId(run.default_tester__username),
            assignee__username: run.default_tester__username,
            tested_by__username: tester,
            start_date: status === 1 ? null : execStart.toISOString(),
            stop_date: status === 1 ? null : new Date(execStart.getTime() + seconds * 1000).toISOString(),
            sortkey: ci * 10,
          });
        });
      }
    }
  }

  // Bugs vinculados às falhas mais recentes de cada caso instável, no tracker do card do plano.
  let bugNo = 512;
  for (const e of [...db.executions].reverse()) {
    if (e.status === 5 && FLAKY.has(e.case__summary) && !db.links.some((l) => db.executions.find((x) => x.id === l.execution)?.case === e.case)) {
      const plan = db.plans.find((p) => p.id === db.runs.find((r) => r.id === e.run)?.plan);
      const key = plan?.extra_link?.startsWith("AB#") ? `AB#${bugNo++}` : `SHOP-${bugNo++}`;
      db.links.push({
        id: db.seq++,
        execution: e.id,
        name: key,
        url: exampleBugUrl(key),
        is_defect: true,
        created_on: e.stop_date ?? new Date().toISOString(),
      });
    }
  }
  return db;
}

/** Bug fictício do modo de exemplo: domínio reservado (.invalid), para nunca abrir um item inexistente num tracker real. */
function exampleBugUrl(key: string) {
  return `https://bug-de-exemplo.invalid/${encodeURIComponent(key)}`;
}

function clonePlanTypes() {
  return PLAN_TYPES.map((t) => ({ ...t }));
}

// Sobrevive ao hot reload do Next em dev. A versão invalida dados de um formato antigo.
const DB_VERSION = 6;
const g = globalThis as unknown as { __kiwiMock?: Db; __kiwiMockVersion?: number };
if (g.__kiwiMockVersion !== DB_VERSION) {
  g.__kiwiMock = seed();
  g.__kiwiMockVersion = DB_VERSION;
}
const db = g.__kiwiMock!;

/** Filtro mínimo no estilo do Django: `campo`, `campo__in`, `campo__icontains`. */
function match<T extends object>(rows: T[], query: Query = {}): T[] {
  return rows.filter((row) =>
    Object.entries(query).every(([key, value]) => {
      const rec = row as Record<string, unknown>;
      if (key.endsWith("__in")) return (value as unknown[]).includes(rec[key.slice(0, -4)]);
      if (key.endsWith("__icontains")) return String(rec[key.slice(0, -11)] ?? "").toLowerCase().includes(String(value).toLowerCase());
      return rec[key] === value;
    }),
  );
}

const clone = <T>(v: T): T => structuredClone(v);
const now = () => new Date().toISOString();

function toCase(c: MockCase): TestCase {
  const copy: Partial<MockCase> = { ...c };
  delete copy.plans;
  return clone(copy as TestCase);
}

function find<T extends { id: number }>(rows: T[], id: number, what: string): T {
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error(`${what} ${id} não existe`);
  return row;
}

/** Recalcula os campos "a__b" depois de uma criação/edição. */
function refreshPlan(p: TestPlan) {
  p.product__name = nameOf(db.products, p.product, "name");
  p.product_version__value = nameOf(db.versions, p.product_version, "value");
  p.type__name = nameOf(db.planTypes, p.type, "name");
}
function refreshCase(c: MockCase) {
  c.priority__value = nameOf(PRIORITIES, c.priority, "value");
  c.category__name = nameOf(db.categories, c.category, "name");
  c.case_status__name = nameOf(CASE_STATUSES, c.case_status, "name");
  for (const e of db.executions) if (e.case === c.id) e.case__summary = c.summary;
}

export function mockKiwi(username: string): KiwiApi {
  // Quem entra no modo mock vira um usuário de verdade da lista.
  if (!db.users.some((u) => u.username === username)) db.users.push({ id: db.seq++, username });
  const userName = (id: number | null) => (id === null ? null : (db.users.find((u) => u.id === id)?.username ?? null));

  return {
    products: async () => clone(db.products),
    versions: async (q) => clone(match(db.versions, q)),
    builds: async (q) => clone(match(db.builds, q)),
    planTypes: async () => clone(db.planTypes),
    categories: async (q) => clone(match(db.categories, q)),
    priorities: async () => clone(PRIORITIES),
    caseStatuses: async () => clone(CASE_STATUSES),
    users: async (q) => clone(match(db.users, q)),
    plans: async (q = {}) => {
      // `cases: id` = planos que contêm o caso (N:N no Kiwi).
      const { cases, ...rest } = q;
      const rows = cases === undefined ? db.plans : db.plans.filter((p) => db.cases.find((c) => c.id === Number(cases))?.plans.includes(p.id));
      return clone(match(rows, rest));
    },
    runs: async (q) => clone(match(db.runs, q)),
    cases: async (q = {}) => {
      const { plan, plan__in, ...rest } = q;
      let rows = plan === undefined ? db.cases : db.cases.filter((c) => c.plans.includes(Number(plan)));
      if (Array.isArray(plan__in)) rows = rows.filter((c) => c.plans.some((p) => (plan__in as number[]).includes(p)));
      return match(rows, rest).map(toCase);
    },
    executions: async (q) => clone(match(db.executions, q)),
    statuses: async () => clone(STATUSES),
    links: async (q) => clone(match(db.links, q)),
    comments: async (id) => clone(db.comments.filter((c) => c.object_pk === String(id))),

    classifications: async (q) => clone(match(db.classifications, q)),
    createClassification: async ({ name }) => {
      const c = { id: db.seq++, name };
      db.classifications.push(c);
      return clone(c);
    },
    createProduct: async ({ name, description }) => {
      if (db.products.some((p) => p.name.toLowerCase() === name.toLowerCase())) throw new Error(`Já existe um projeto chamado ${name}`);
      const p = { id: db.seq++, name, description: description ?? "" };
      db.products.push(p);
      return clone(p);
    },
    createVersion: async (values) => {
      const v = { id: db.seq++, ...values };
      db.versions.push(v);
      return clone(v);
    },
    createCategory: async (values) => {
      const c = { id: db.seq++, ...values };
      db.categories.push(c);
      return clone(c);
    },
    createPlanType: async ({ name }) => {
      const t = { id: db.seq++, name };
      db.planTypes.push(t);
      return clone(t);
    },

    createPlan: async (values) => {
      const p: TestPlan = {
        id: db.seq++,
        ...values,
        is_active: true,
        create_date: now(),
        author__username: username,
        product__name: "",
        product_version__value: "",
        type__name: "",
      };
      refreshPlan(p);
      db.plans.push(p);
      return clone(p);
    },
    updatePlan: async (id, values) => {
      const p = find(db.plans, id, "Plano");
      Object.assign(p, values);
      refreshPlan(p);
      for (const r of db.runs) if (r.plan === id) r.plan__name = p.name;
      return clone(p);
    },
    createCase: async (values) => {
      const c: MockCase = { id: db.seq++, plans: [], ...values, author__username: username, priority__value: "", category__name: "", case_status__name: "" };
      refreshCase(c);
      db.cases.push(c);
      return toCase(c);
    },
    updateCase: async (id, values) => {
      const c = find(db.cases, id, "Caso");
      Object.assign(c, values);
      refreshCase(c);
      return toCase(c);
    },
    addCaseToPlan: async (planId, caseId) => {
      find(db.plans, planId, "Plano");
      const c = find(db.cases, caseId, "Caso");
      if (!c.plans.includes(planId)) c.plans.push(planId);
    },
    removeCaseFromPlan: async (planId, caseId) => {
      const c = find(db.cases, caseId, "Caso");
      c.plans = c.plans.filter((p) => p !== planId);
    },
    createBuild: async ({ name, version }) => {
      const b: Build = { id: db.seq++, name, version, version__value: nameOf(db.versions, version, "value"), is_active: true };
      db.builds.push(b);
      return clone(b);
    },
    createRun: async (values) => {
      const plan = find(db.plans, values.plan, "Plano");
      const build = find(db.builds, values.build, "Build");
      const r: TestRun = {
        id: db.seq++,
        summary: values.summary,
        plan: plan.id,
        plan__name: plan.name,
        build: build.id,
        build__name: build.name,
        manager__username: userName(values.manager) ?? username,
        default_tester__username: userName(values.default_tester),
        start_date: now(),
        stop_date: null,
        planned_start: null,
        planned_stop: null,
        notes: "",
      };
      db.runs.push(r);
      return clone(r);
    },
    addCaseToRun: async (runId, caseId) => {
      const run = find(db.runs, runId, "Run");
      const c = find(db.cases, caseId, "Caso");
      const existing = db.executions.find((e) => e.run === runId && e.case === caseId);
      if (existing) return clone(existing);
      const tester = run.default_tester__username;
      const e: TestExecution = {
        id: db.seq++,
        run: runId,
        case: caseId,
        case__summary: c.summary,
        build: run.build,
        build__name: run.build__name,
        status: 1,
        status__name: "IDLE",
        assignee: db.users.find((u) => u.username === tester)?.id ?? null,
        assignee__username: tester,
        tested_by__username: null,
        start_date: null,
        stop_date: null,
        sortkey: db.executions.filter((x) => x.run === runId).length * 10,
      };
      db.executions.push(e);
      return clone(e);
    },

    updateExecution: async (id, values) => {
      const e = find(db.executions, id, "Execução");
      if (values.status !== undefined) {
        const t = now();
        const weight = STATUSES.find((s) => s.id === values.status)?.weight ?? 0;
        Object.assign(e, { status: values.status, status__name: nameOf(STATUSES, values.status, "name"), start_date: e.start_date ?? t });
        // Como no Kiwi: só um resultado final (peso ≠ 0) registra quem testou e o fim.
        if (weight !== 0) Object.assign(e, { tested_by__username: username, stop_date: t });
      }
      const fromKiwi = (v: string) => new Date(v.replace(" ", "T") + "Z").toISOString();
      if (values.start_date) e.start_date = fromKiwi(values.start_date);
      if (values.stop_date) e.stop_date = fromKiwi(values.stop_date);
      if (values.assignee !== undefined) Object.assign(e, { assignee: values.assignee, assignee__username: userName(values.assignee) });
      return clone(e);
    },
    addComment: async (id, comment) => {
      db.comments.push({ id: db.seq++, object_pk: String(id), user__username: username, comment, submit_date: now() });
    },
    addLink: async (id, link) => {
      const l: LinkReference = { id: db.seq++, execution: id, created_on: now(), ...link };
      db.links.push(l);
      return clone(l);
    },
    removeLink: async (linkId) => {
      db.links = db.links.filter((l) => l.id !== linkId);
    },
    reportBug: async (id) => {
      const key = `SHOP-${db.seq++}`;
      const url = exampleBugUrl(key);
      db.links.push({ id: db.seq++, execution: id, name: key, url, is_defect: true, created_on: now() });
      return url;
    },
  };
}
