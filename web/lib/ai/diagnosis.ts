import "server-only";
import * as z from "zod/v4";
import { askClaude, claudeConfigured } from "./client";
import { diagnoseViaN8n } from "./n8n";
import { CONFIDENCES, DIAGNOSIS_CATEGORIES, parseDiagnosis, type Diagnosis } from "./parse";

// Diagnóstico das falhas de um run: agrupa por causa provável e sugere a próxima ação.

const Schema = z.object({
  summary: z.string().describe("1 a 3 frases sobre o run como um todo."),
  groups: z.array(
    z.object({
      title: z.string(),
      category: z.string().describe(`Um de: ${DIAGNOSIS_CATEGORIES.join(", ")}`),
      confidence: z.string().describe(`Um de: ${CONFIDENCES.join(", ")}`),
      executions: z.array(z.number().int()).describe("Ids de execução (campo \"execution\") deste grupo."),
      evidence: z.string(),
      action: z.string(),
    }),
  ),
});

const SYSTEM = `Você é um analista de QA sênior. Analise as falhas de um run de testes e agrupe-as por causa provável.

Cada falha traz "execution" (o id que você deve citar), o caso, os passos, os comentários de quem testou, os bugs vinculados e "signals", calculados do histórico: Regressão = passava na build anterior; Recorrente = falhou 2+ das últimas 5; Instável = alterna passou/falhou; Nova = primeira execução; Sem bug = nenhum bug vinculado.

Regras:
- Escreva em português do Brasil, de forma objetiva.
- Agrupe falhas que parecem ter a mesma causa (mesma tela, mesma mensagem de erro, mesmo dado). Uma falha pode ficar sozinha num grupo.
- "category": "produto" (defeito no sistema), "ambiente" (servidor fora, lentidão, configuração), "dados" (massa de teste), "caso_desatualizado" (o caso não reflete mais o sistema) ou "instavel" (teste instável).
- "confidence": "alta", "média" ou "baixa". NÃO invente causa sem evidência: se os comentários e passos não bastam, use "baixa" e diga o que falta investigar.
- "evidence": cite o que nos comentários, passos ou sinais sustenta a hipótese.
- "action": a próxima ação concreta (ex.: abrir bug com X, revisar o passo Y do caso, reexecutar após corrigir o ambiente).`;

export async function diagnose(payload: unknown, executionIds: number[]): Promise<Diagnosis> {
  if (!claudeConfigured()) return diagnoseViaN8n(payload, executionIds);
  const out = await askClaude({
    system: SYSTEM,
    user: `Run e falhas (JSON):\n${JSON.stringify(payload)}`,
    schema: Schema,
    effort: "high",
    task: "o diagnóstico das falhas",
  });
  return parseDiagnosis(out, executionIds);
}
