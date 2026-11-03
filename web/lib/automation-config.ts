import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { ApiError } from "./api";

// Cadastro de automação por projeto (Product do Kiwi): o sistema a testar, como é o
// login e o usuário de teste. A API do Kiwi não atualiza Product, então fica num JSON
// do QA Hub (volume do Docker, com backup). A senha vai criptografada (AES-256-GCM).

export interface LoginSettings {
  /** Caminho da tela de login, ex.: "/login". */
  path: string;
  userLabel: string;
  passwordLabel: string;
  submitLabel: string;
  /** Trecho do endereço que indica "logado", ex.: "/dashboard". */
  successUrl: string;
}

export interface ProjectAutomation {
  productId: number;
  baseUrl: string;
  /** Pasta dos testes no qa-automacao: tests/<folder>/. */
  folder: string;
  login: LoginSettings;
  user: string;
  passwordEnc: string | null;
  updatedAt: string;
  updatedBy: string;
}

/** O que a tela vê: tudo, menos a senha. */
export type ProjectAutomationView = Omit<ProjectAutomation, "passwordEnc"> & { hasPassword: boolean };

export const DEFAULT_LOGIN: LoginSettings = { path: "/login", userLabel: "Usuário", passwordLabel: "Senha", submitLabel: "Entrar", successUrl: "" };

const dataDir = () => process.env.AUTOMATION_DATA_DIR ?? path.join(process.cwd(), ".data");
const file = () => path.join(dataDir(), "projetos.json");

function key() {
  const secret = process.env.AUTOMATION_SECRET || process.env.SESSION_SECRET;
  if (!secret) throw new Error("Defina AUTOMATION_SECRET (ou SESSION_SECRET) para guardar senhas de automação");
  return createHash("sha256").update(`qahub-automacao:${secret}`).digest();
}

/** "v1:" + base64(iv 12 bytes + tag 16 bytes + texto cifrado). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64")}`;
}

export function decrypt(enc: string): string {
  if (!enc.startsWith("v1:")) throw new Error("Formato de senha desconhecido");
  const raw = Buffer.from(enc.slice(3), "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

async function readAll(): Promise<Record<string, ProjectAutomation>> {
  try {
    return JSON.parse(await readFile(file(), "utf8")) as Record<string, ProjectAutomation>;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw e;
  }
}

async function writeAll(all: Record<string, ProjectAutomation>) {
  await mkdir(dataDir(), { recursive: true });
  const tmp = `${file()}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(all, null, 2), { mode: 0o600 });
  await rename(tmp, file());
}

export async function getAutomation(productId: number): Promise<ProjectAutomation | null> {
  return (await readAll())[String(productId)] ?? null;
}

export async function listAutomations(): Promise<Record<string, ProjectAutomation>> {
  return readAll();
}

export const toView = ({ passwordEnc, ...rest }: ProjectAutomation): ProjectAutomationView => ({ ...rest, hasPassword: !!passwordEnc });

const text = (v: unknown, field: string, max = 100, required = true) => {
  const s = typeof v === "string" ? v.trim() : "";
  if (required && !s) throw new ApiError(`Preencha: ${field}`);
  if (s.length > max) throw new ApiError(`${field}: no máximo ${max} caracteres`);
  return s;
};

/**
 * Valida e grava. `password` vazio mantém a senha atual; `clearPassword` apaga.
 */
export async function saveAutomation(productId: number, raw: Record<string, unknown>, username: string): Promise<ProjectAutomation> {
  const baseUrl = text(raw.baseUrl, "URL do sistema", 300).replace(/\/+$/, "");
  if (!/^https?:\/\/[^\s/]+/i.test(baseUrl)) throw new ApiError("URL do sistema: use http:// ou https://");
  const folder = text(raw.folder, "pasta dos testes", 40).toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(folder)) throw new ApiError("Pasta dos testes: só letras minúsculas, números e hífen (ex.: line)");
  const l = (raw.login ?? {}) as Record<string, unknown>;
  const loginPath = text(l.path, "caminho da tela de login", 200) || "/login";
  const login: LoginSettings = {
    path: loginPath.startsWith("/") ? loginPath : `/${loginPath}`,
    userLabel: text(l.userLabel, "rótulo do campo de usuário"),
    passwordLabel: text(l.passwordLabel, "rótulo do campo de senha"),
    submitLabel: text(l.submitLabel, "texto do botão de entrar"),
    successUrl: text(l.successUrl, "endereço depois do login", 200, false),
  };
  const user = text(raw.user, "usuário de teste", 150);

  const all = await readAll();
  const current = all[String(productId)];
  const password = typeof raw.password === "string" ? raw.password : "";
  if (password.length > 200) throw new ApiError("Senha: no máximo 200 caracteres");
  const passwordEnc = raw.clearPassword === true ? null : password ? encrypt(password) : (current?.passwordEnc ?? null);
  if (!passwordEnc) throw new ApiError("Informe a senha do usuário de teste");

  const saved: ProjectAutomation = { productId, baseUrl, folder, login, user, passwordEnc, updatedAt: new Date().toISOString(), updatedBy: username };
  all[String(productId)] = saved;
  await writeAll(all);
  return saved;
}
