import "server-only";
import { Agent, fetch as undiciFetch } from "undici";
import type { KiwiApi, Query, TestExecution } from "./types";

export class KiwiError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
  ) {
    super(message);
  }
}

function kiwiUrl() {
  const url = process.env.KIWI_URL;
  if (!url) throw new KiwiError("KIWI_URL não definido (veja web/.env.example)");
  return url.replace(/\/$/, "") + "/json-rpc/";
}

// Cabeçalhos do Cloudflare Access (service token), quando o Kiwi está atrás dele.
function accessHeaders(): Record<string, string> {
  const id = process.env.CF_ACCESS_CLIENT_ID;
  const secret = process.env.CF_ACCESS_CLIENT_SECRET;
  return id && secret ? { "CF-Access-Client-Id": id, "CF-Access-Client-Secret": secret } : {};
}

// O Kiwi usa certificado autoassinado. Com KIWI_INSECURE_TLS=1 (só na rede interna
// do Docker), apenas as chamadas ao Kiwi deixam de validar o certificado; o resto
// do processo (ex.: Azure DevOps com o PAT) continua validando normalmente.
let insecureAgent: Agent | undefined;
function kiwiFetch(url: string, init: { method: string; headers: Record<string, string>; body: string }) {
  if (process.env.KIWI_INSECURE_TLS !== "1") return fetch(url, { ...init, cache: "no-store" });
  insecureAgent ??= new Agent({ connect: { rejectUnauthorized: false } });
  return undiciFetch(url, { ...init, dispatcher: insecureAgent });
}

let nextId = 1;

/** Chamada JSON-RPC 2.0 crua ao Kiwi. `sessionId` é o valor do cookie `sessionid`. */
export async function rpc<T>(method: string, params: unknown[] | Record<string, unknown>, sessionId?: string): Promise<T> {
  const res = await kiwiFetch(kiwiUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...accessHeaders(),
      ...(sessionId ? { Cookie: `sessionid=${sessionId}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
  });
  if (!res.ok) throw new KiwiError(`Kiwi respondeu HTTP ${res.status} em ${method}`);
  const body = await res.json();
  if (body.error) throw new KiwiError(body.error.message ?? String(body.error), body.error.code);
  return body.result as T;
}

export async function login(username: string, password: string): Promise<string> {
  return rpc<string>("Auth.login", [username, password]);
}

export async function logout(sessionId: string): Promise<void> {
  await rpc("Auth.logout", [], sessionId);
}

export function realKiwi(sessionId: string): KiwiApi {
  const call = <T>(method: string, ...params: unknown[]) => rpc<T>(method, params, sessionId);
  const filter = <T>(method: string, query: Query = {}) => call<T[]>(method, query);
  // create/update devolvem formatos que variam entre versões do Kiwi; relemos
  // pelo .filter para ter sempre os mesmos campos (com os "a__b").
  const one = async <T>(method: string, id: number): Promise<T> => {
    const [row] = await filter<T>(method, { id });
    if (!row) throw new KiwiError(`${method}: registro ${id} não encontrado`);
    return row;
  };

  return {
    products: () => filter("Product.filter"),
    versions: (q) => filter("Version.filter", q),
    builds: (q) => filter("Build.filter", q),
    planTypes: () => filter("PlanType.filter"),
    categories: (q) => filter("Category.filter", q),
    priorities: () => filter("Priority.filter"),
    caseStatuses: () => filter("TestCaseStatus.filter"),
    users: (q) => filter("User.filter", { is_active: true, ...q }),
    plans: (q) => filter("TestPlan.filter", q),
    runs: (q) => filter("TestRun.filter", q),
    cases: (q) => filter("TestCase.filter", q),
    executions: (q) => filter("TestExecution.filter", q),
    statuses: () => filter("TestExecutionStatus.filter"),
    links: (q) => filter("TestExecution.get_links", q),
    comments: (id) => call("TestExecution.get_comments", id),

    classifications: (q) => filter("Classification.filter", q),
    createClassification: async (values) => {
      const r = await call<{ id: number }>("Classification.create", values);
      return one("Classification.filter", r.id);
    },
    createProduct: async (values) => {
      const r = await call<{ id: number }>("Product.create", { description: "", ...values });
      return one("Product.filter", r.id);
    },
    createVersion: async (values) => {
      const r = await call<{ id: number }>("Version.create", values);
      return one("Version.filter", r.id);
    },
    createCategory: async (values) => {
      const r = await call<{ id: number }>("Category.create", { ...values, description: "" });
      return one("Category.filter", r.id);
    },
    createPlanType: async (values) => {
      const r = await call<{ id: number }>("PlanType.create", { ...values, description: "" });
      return one("PlanType.filter", r.id);
    },

    createPlan: async (values) => {
      const r = await call<{ id: number }>("TestPlan.create", { ...values, is_active: true });
      return one("TestPlan.filter", r.id);
    },
    updatePlan: async (id, values) => {
      await call("TestPlan.update", id, values);
      return one("TestPlan.filter", id);
    },
    createCase: async (values) => {
      const r = await call<{ id: number }>("TestCase.create", values);
      return one("TestCase.filter", r.id);
    },
    updateCase: async (id, values) => {
      await call("TestCase.update", id, values);
      return one("TestCase.filter", id);
    },
    addCaseToPlan: async (planId, caseId) => {
      await call("TestPlan.add_case", planId, caseId);
    },
    removeCaseFromPlan: async (planId, caseId) => {
      await call("TestPlan.remove_case", planId, caseId);
    },
    createBuild: async (values) => {
      const r = await call<{ id: number }>("Build.create", { ...values, is_active: true });
      return one("Build.filter", r.id);
    },
    createRun: async (values) => {
      const r = await call<{ id: number }>("TestRun.create", values);
      return one("TestRun.filter", r.id);
    },
    addCaseToRun: async (runId, caseId) => {
      await call("TestRun.add_case", runId, caseId);
      const [e] = await filter<TestExecution>("TestExecution.filter", { run: runId, case: caseId });
      if (!e) throw new KiwiError(`Caso ${caseId} não entrou no run ${runId}`);
      return e;
    },

    updateExecution: (id, values) => call("TestExecution.update", id, values),
    addComment: async (id, comment) => {
      await call("TestExecution.add_comment", id, comment);
    },
    addLink: (id, link) => call("TestExecution.add_link", { execution_id: id, ...link }, false),
    removeLink: async (linkId) => {
      await call("TestExecution.remove_link", { pk: linkId });
    },
    reportBug: async (id, trackerId) => {
      const r = await call<{ rc: number; response: string }>("Bug.report", id, trackerId);
      if (r.rc !== 0) throw new KiwiError(r.response);
      return r.response;
    },
  };
}
