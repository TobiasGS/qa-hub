import "server-only";
import * as z from "zod/v4";
import { askClaude, claudeConfigured } from "./client";
import { generatePlaywrightViaN8n } from "./n8n";
import { parseSpec, type GeneratedSpec } from "./parse";

// "Gerar teste Playwright": um *.spec.ts a partir do Dado/Quando/Então do caso, com o [TC-id] no título.

export interface PlaywrightPayload {
  case: { id: number; title: string; steps: string; requirement: string | null };
  plan: { id: number; name: string; hints: string };
}

const Schema = z.object({
  filename: z.string().describe("tc-<id>-nome-curto.spec.ts"),
  code: z.string(),
});

const SYSTEM = `Você é um engenheiro de automação de testes sênior em Playwright com TypeScript. Escreva o teste do caso recebido.

Regras do código:
- Um arquivo *.spec.ts com: import { expect, test } from "@playwright/test"; (a menos que as dicas do plano mandem importar de outro lugar).
- O título do teste DEVE começar com "[TC-<id do caso>] " seguido do título do caso. Um teste por cenário do Gherkin (se houver mais de um, todos com o mesmo [TC-id]).
- Use caminhos relativos em page.goto (o baseURL vem da configuração). O login já está feito pela sessão salva (storageState): NÃO faça login no teste.
- Prefira page.getByRole, getByLabel e getByText com expressões regulares tolerantes (ex.: /gerar|consultar/i). Nada de XPath nem seletores CSS frágeis.
- Cada passo vira um comentário com o texto do Gherkin ("// Dado ...", "// Quando ...", "// Então ...") seguido do código.
- Use os "Dados de teste" do caso, quando houver.
- Onde o seletor, a rota ou o dado for um palpite, adicione "// TODO(seletores): ..." ou "// TODO(dados): ..." explicando o que conferir.
- Asserções reais com expect (toBeVisible, toHaveText, toHaveCount, toHaveURL), nunca waitForTimeout.
- "code" é o arquivo completo; "filename" no formato tc-<id>-nome-curto.spec.ts.`;

export async function generatePlaywright(p: PlaywrightPayload): Promise<GeneratedSpec> {
  if (!claudeConfigured()) return generatePlaywrightViaN8n(p, p.case.id);
  const user = [
    `Caso TC-${p.case.id}: ${p.case.title}`,
    `Card: ${p.case.requirement || "(sem card)"}`,
    `Plano: ${p.plan.name || "(sem plano)"}`,
    "",
    "Passos do caso:",
    p.case.steps,
    "",
    "Dicas de seletores e telas do sistema:",
    p.plan.hints || "(nenhuma)",
  ].join("\n");
  const out = await askClaude({ system: SYSTEM, user, schema: Schema, effort: "medium", task: "o teste Playwright" });
  return parseSpec(out, p.case.id);
}
