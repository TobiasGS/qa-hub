import "server-only";
import * as z from "zod/v4";
import { ApiError } from "../api";
import { askClaude, claudeConfigured } from "./client";
import { generateCasesViaN8n } from "./n8n";
import { normalizeCases, normalizeAnalysis, type CasesResult } from "./parse";

// "Gerar casos da história": as instruções do assistente de QA (Projeto QIA) adaptadas ao QA Hub.
// A resposta traz a análise da história e os cenários prontos para revisar e criar no plano.

export interface StoryPayload {
  story: { key: string; title: string; description: string; acceptanceCriteria: string };
  existingCases: string[];
}

// O SDK passa as listas fechadas como descrição (não como enum): o QA Hub normaliza depois (lib/ai/parse.ts).
const oneOf = (values: readonly string[]) => z.string().describe(`Um de: ${values.join(", ")}`);
const FLOWS = ["principal", "alternativo", "exceção", "borda"];
const LEVELS = ["alto", "médio", "baixo"];
const POINT_TYPES = ["incongruência", "zona cinzenta", "ambiguidade", "fluxo incompleto", "critério de aceite ausente", "sugestão de melhoria"];

const Schema = z.object({
  analysis: z.object({
    summary: z.string().describe("Resumo da funcionalidade em 1 a 3 frases."),
    stories: z.array(z.string()).describe("Histórias de usuário identificadas na documentação."),
    points: z
      .array(z.object({ type: oneOf(POINT_TYPES), text: z.string() }))
      .describe("Análise crítica: problemas da documentação e sugestões, cada um com o tipo."),
    nonFunctional: z.object({
      security: z.array(z.string()),
      performance: z.array(z.string()),
      usability: z.array(z.string()),
    }),
    impact: z.object({ level: oneOf(LEVELS), reason: z.string() }),
  }),
  cases: z.array(
    z.object({
      title: z.string(),
      flow: oneOf(FLOWS),
      priority: oneOf(["alta", "média", "baixa"]),
      summary: z.string(),
      preconditions: z.string().describe("Pré-condições; vazio se não houver."),
      testData: z.string().describe("Dados de teste concretos; vazio se não houver."),
      gherkin: z.string().describe("Cenário: ...\\n  Dado ...\\n  Quando ...\\n  Então ..."),
      expected: z.string().describe("Resultado esperado em uma frase."),
      impact: oneOf(LEVELS),
      impactReason: z.string(),
    }),
  ),
});

const SYSTEM = `Você é um Assistente de QA Sênior, especialista em metodologia ágil, com profundo conhecimento em análise de requisitos, criação de casos de teste (funcionais e não funcionais) e identificação de riscos.

Você recebe a história de uma funcionalidade (título, descrição e critérios de aceite, vindos do Azure DevOps). Analise-a criticamente e produza:

1. Análise da funcionalidade
- "summary": resumo curto da funcionalidade.
- "stories": as histórias de usuário que a documentação descreve (a própria história e outras citadas).
- "points": incongruências, zonas cinzentas, ambiguidades, fluxos incompletos, critérios de aceite ausentes e sugestões de melhoria. Cada ponto com o seu tipo, objetivo e acionável para o PO.
  Use este checklist para achar lacunas, conforme o tipo de tela:
  • Formulário/filtro, por campo: é obrigatório? deve ser único? qual o tipo? limites mínimo e máximo de caracteres ou de valor; máscara; para datas, o formato, se tem hora e os limites de data; para seleção, quais são as opções e de onde vêm.
  • Botões: o que a submissão valida e faz com os dados; o que a limpeza restaura ou recarrega.
  • Relatório/lista: colunas e formatação; ordenação inicial; paginação (opções e valor inicial); ações por linha (navega, abre modal, exporta em qual formato, exclui/inativa com confirmação?).
  • Permissões: quem vê ou executa cada ação.
  • Fluxo: atores, pontos de decisão, o que acontece em cada recusa ou exceção, notificações e integrações.
  • Regras de negócio: se a história cita regras (ex.: RN01), cada uma deve ter condição e consequência testáveis.
- "nonFunctional": sugestões específicas para esta funcionalidade de testes de segurança (ex.: injeção, XSS, controle de acesso), performance (carga, estresse, tempo de resposta) e usabilidade (clareza, feedback ao usuário).
- "impact": nível de impacto da funcionalidade no sistema como um todo, com justificativa.

2. Cenários de teste ("cases")
- Cubra todos os critérios de aceite e todos os tipos de fluxo: principal (caminho feliz), alternativo, exceção (erros e dados inválidos) e borda (valores limite).
- Aplique as técnicas do ISTQB: partição de equivalência, análise de valor limite, tabela de decisão e transição de estado, quando fizerem sentido.
- Cada cenário: título claro; fluxo; prioridade (alta = caminho crítico ou risco alto); resumo; pré-condições; dados de teste concretos (valores reais de exemplo, não "um valor válido"); passos em Gherkin; resultado esperado; impacto no software com justificativa.
- Gherkin em português do Brasil: "Cenário: <título>" e, nas linhas seguintes, indentadas com 2 espaços, Dado / Quando / Então / E. Se a história citar regras (RNxx), mencione a regra no cenário.
- Não repita os casos que já existem no plano (lista enviada). Gere entre 5 e 15 cenários, sem cenários redundantes.
- Se a documentação não permitir saber o comportamento esperado, não invente: registre o ponto em "points" e escreva o cenário com a dúvida explícita no resultado esperado.

Escreva tudo em português do Brasil, de forma objetiva.`;

function userMessage(p: StoryPayload) {
  return [
    `História ${p.story.key}: ${p.story.title}`,
    "",
    "Descrição:",
    p.story.description || "(sem descrição)",
    "",
    "Critérios de aceite:",
    p.story.acceptanceCriteria || "(sem critérios de aceite)",
    "",
    `Casos que JÁ existem no plano (não repita): ${JSON.stringify(p.existingCases)}`,
  ].join("\n");
}

export async function generateCases(payload: StoryPayload): Promise<CasesResult> {
  if (!claudeConfigured()) return generateCasesViaN8n(payload);
  const out = await askClaude({ system: SYSTEM, user: userMessage(payload), schema: Schema, effort: "high", task: "os casos da história" });
  const cases = normalizeCases(out.cases);
  if (!cases.length) throw new ApiError("A IA não devolveu nenhum caso aproveitável. Tente de novo ou revise a história no Azure.", 502);
  return { cases, analysis: normalizeAnalysis(out.analysis) };
}
