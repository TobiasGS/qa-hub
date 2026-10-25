// Formas devolvidas pela JSON-RPC do Kiwi TCMS (*.filter). Os nomes dos campos
// seguem exatamente o que a API devolve, inclusive os "a__b" dos relacionamentos.
// Confira com `node scripts/kiwi-inspect.mjs` sempre que atualizar o Kiwi.

export type Query = Record<string, unknown>;

/** No QA Hub o Product do Kiwi aparece como "Projeto". */
export interface Product {
  id: number;
  name: string;
  /** O QA Hub guarda aqui o dono do projeto: "[qahub-owner:<usuário>]" (o Kiwi não registra quem criou). */
  description?: string;
}

export interface Classification {
  id: number;
  name: string;
}

export interface Version {
  id: number;
  value: string;
  product: number;
}

export interface Build {
  id: number;
  name: string;
  version: number;
  version__value?: string;
  is_active: boolean;
}

export interface PlanType {
  id: number;
  name: string;
}

export interface Category {
  id: number;
  name: string;
  product: number;
}

export interface Priority {
  id: number;
  value: string;
}

export interface CaseStatus {
  id: number;
  name: string;
}

export interface User {
  id: number;
  username: string;
  first_name?: string;
  last_name?: string;
  is_superuser?: boolean;
}

export interface TestPlan {
  id: number;
  name: string;
  text?: string;
  is_active: boolean;
  create_date: string;
  extra_link?: string | null;
  product: number;
  product__name: string;
  product_version: number;
  product_version__value: string;
  author__username: string;
  type: number;
  type__name: string;
}

export interface TestRun {
  id: number;
  summary: string;
  plan: number;
  plan__name: string;
  build: number;
  build__name: string;
  manager__username: string;
  default_tester__username: string | null;
  start_date: string | null;
  stop_date: string | null;
  planned_start: string | null;
  planned_stop: string | null;
  notes: string;
}

export interface TestCase {
  id: number;
  summary: string;
  requirement: string | null;
  is_automated: boolean;
  case_status: number;
  case_status__name: string;
  category: number;
  category__name: string;
  priority: number;
  priority__value: string;
  author__username: string;
  text?: string;
}

export interface TestExecution {
  id: number;
  run: number;
  case: number;
  case__summary: string;
  build: number;
  build__name: string;
  status: number;
  status__name: string;
  assignee: number | null;
  assignee__username: string | null;
  tested_by__username: string | null;
  start_date: string | null;
  stop_date: string | null;
  sortkey: number;
}

export interface ExecutionStatus {
  id: number;
  name: string;
  /** >0 passou, <0 falhou, 0 ainda não executado (IDLE/RUNNING/PAUSED) */
  weight: number;
  icon: string;
  color: string;
}

export interface LinkReference {
  id: number;
  execution: number;
  name: string;
  url: string;
  is_defect: boolean;
  created_on: string;
}

export interface Comment {
  id: number;
  object_pk: string;
  user__username?: string;
  comment: string;
  submit_date: string;
}

export interface PlanInput {
  name: string;
  text: string;
  product: number;
  product_version: number;
  type: number;
  extra_link: string | null;
}

export interface CaseInput {
  summary: string;
  text: string;
  requirement: string | null;
  priority: number;
  category: number;
  case_status: number;
  is_automated: boolean;
}

export interface RunInput {
  plan: number;
  build: number;
  summary: string;
  manager: number;
  default_tester: number | null;
}

/** Contrato único que o QA Hub usa — implementado pela API real e pelo mock. */
export interface KiwiApi {
  products(): Promise<Product[]>;
  versions(query?: Query): Promise<Version[]>;
  builds(query?: Query): Promise<Build[]>;
  planTypes(): Promise<PlanType[]>;
  categories(query?: Query): Promise<Category[]>;
  priorities(): Promise<Priority[]>;
  caseStatuses(): Promise<CaseStatus[]>;
  users(query?: Query): Promise<User[]>;
  plans(query?: Query): Promise<TestPlan[]>;
  runs(query?: Query): Promise<TestRun[]>;
  /** Aceita `plan: id` / `plan__in: [ids]` para trazer os casos de planos. */
  cases(query?: Query): Promise<TestCase[]>;
  executions(query: Query): Promise<TestExecution[]>;
  statuses(): Promise<ExecutionStatus[]>;
  links(query: Query): Promise<LinkReference[]>;
  comments(executionId: number): Promise<Comment[]>;

  classifications(query?: Query): Promise<Classification[]>;
  createClassification(values: { name: string }): Promise<Classification>;
  createProduct(values: { name: string; classification: number; description?: string }): Promise<Product>;
  createVersion(values: { product: number; value: string }): Promise<Version>;
  createCategory(values: { product: number; name: string }): Promise<Category>;
  createPlanType(values: { name: string }): Promise<PlanType>;

  createPlan(values: PlanInput): Promise<TestPlan>;
  updatePlan(id: number, values: Partial<PlanInput> & { is_active?: boolean }): Promise<TestPlan>;
  createCase(values: CaseInput): Promise<TestCase>;
  updateCase(id: number, values: Partial<CaseInput>): Promise<TestCase>;
  addCaseToPlan(planId: number, caseId: number): Promise<void>;
  removeCaseFromPlan(planId: number, caseId: number): Promise<void>;
  createBuild(values: { name: string; version: number }): Promise<Build>;
  createRun(values: RunInput): Promise<TestRun>;
  /** Adiciona o caso ao run e devolve a execução criada. */
  addCaseToRun(runId: number, caseId: number): Promise<TestExecution>;

  /** start_date/stop_date no formato "AAAA-MM-DD HH:MM:SS" (UTC), como o Kiwi espera. */
  updateExecution(id: number, values: { status?: number; assignee?: number | null; start_date?: string; stop_date?: string }): Promise<TestExecution>;
  addComment(executionId: number, comment: string): Promise<void>;
  addLink(executionId: number, link: { url: string; name: string; is_defect: boolean }): Promise<LinkReference>;
  removeLink(linkId: number): Promise<void>;
  /** Abre o bug no tracker configurado no Kiwi e devolve a URL criada. */
  reportBug(executionId: number, trackerId: number): Promise<string>;
}
