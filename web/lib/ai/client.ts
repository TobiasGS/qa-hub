import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type * as z from "zod/v4";
import { ApiError } from "../api";
import { n8nConfigured } from "./n8n";

// IA do QA Hub: chamada direta à API do Claude. A chave fica só no servidor.
// Sem a chave, as funções de IA usam o n8n (lib/ai/n8n.ts), se ele estiver configurado.
//   ANTHROPIC_API_KEY  chave do Console da Anthropic (conta da empresa)
//   ANTHROPIC_MODEL    opcional; padrão claude-opus-5-5 (o mesmo do Projeto QIA)

/** Claude configurado: tem prioridade sobre o n8n. */
export const claudeConfigured = () => !!process.env.ANTHROPIC_API_KEY;

/** Alguma IA disponível (Claude ou n8n). */
export const aiConfigured = () => claudeConfigured() || n8nConfigured();

const model = () => process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5";

let client: Anthropic | undefined;
const anthropic = () => (client ??= new Anthropic({ maxRetries: 3 }));

export interface AskOptions<T extends z.ZodType> {
  /** Instruções fixas (vão em cache entre chamadas). */
  system: string;
  /** Dados desta chamada (história, falhas, caso). */
  user: string;
  /** Formato exato da resposta: a API garante JSON válido nesse schema. */
  schema: T;
  effort: "low" | "medium" | "high";
  /** Nome da função, para as mensagens de erro e o log. */
  task: string;
}

/** Uma pergunta ao Claude com resposta estruturada. Erros viram ApiError com mensagem clara. */
export async function askClaude<T extends z.ZodType>({ system, user, schema, effort, task }: AskOptions<T>): Promise<z.infer<T>> {
  if (!claudeConfigured()) throw new ApiError("IA não configurada: defina ANTHROPIC_API_KEY no servidor do QA Hub.");
  try {
    const message = await anthropic()
      .beta.messages.stream({
        model: model(),
        max_tokens: 64000,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
        output_config: { effort, format: betaZodOutputFormat(schema) },
        // Se o modelo recusar por política, a API tenta outro modelo na mesma chamada.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      })
      .finalMessage();

    if (message.stop_reason === "refusal") {
      throw new ApiError(`A IA recusou ${task}${message.stop_details?.explanation ? `: ${message.stop_details.explanation}` : ""}. Revise o texto enviado e tente de novo.`, 502);
    }
    if (message.stop_reason === "max_tokens") throw new ApiError(`A resposta da IA para ${task} ficou grande demais e foi cortada. Tente de novo.`, 502);
    if (message.parsed_output == null) throw new ApiError(`A IA não devolveu ${task} no formato esperado. Tente de novo.`, 502);
    const u = message.usage;
    console.info(`[ia] ${task}: ${u.input_tokens} entrada (${u.cache_read_input_tokens ?? 0} do cache), ${u.output_tokens} saída`);
    return message.parsed_output as z.infer<T>;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      throw new ApiError("A API do Claude recusou a chave (ANTHROPIC_API_KEY inválida, revogada ou sem permissão).", 502);
    }
    if (e instanceof Anthropic.RateLimitError) throw new ApiError("Limite de uso da API do Claude atingido. Tente de novo em alguns minutos.", 429);
    if (e instanceof Anthropic.APIConnectionTimeoutError) throw new ApiError(`A IA não respondeu a tempo (${task}). Tente de novo.`, 504);
    if (e instanceof Anthropic.APIConnectionError) throw new ApiError("Não consegui falar com a API do Claude. O servidor do QA Hub tem acesso à internet?", 502);
    if (e instanceof Anthropic.InternalServerError) throw new ApiError("A API do Claude está instável ou sobrecarregada. Tente de novo em alguns minutos.", 502);
    if (e instanceof Anthropic.APIError) throw new ApiError(`A API do Claude respondeu ${e.status}: ${e.message.slice(0, 200)}`, 502);
    throw e;
  }
}
