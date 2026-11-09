import "server-only";

// Avisos no canal do Teams: o QA Hub monta um Adaptive Card e posta direto no webhook do canal.
//   TEAMS_WEBHOOK_URL  URL do fluxo do Teams "Post to a channel when a webhook request is received"
//                      (app Workflows). É um segredo: fica só no .env do servidor.
//   QA_HUB_URL         endereço público do QA Hub, para o botão "Abrir no QA Hub"

type RunRef = { id: number; title: string; plan: string; build: string };

export type NotifyEvent =
  | {
      type: "run_concluido";
      run: RunRef;
      totals: { total: number; passed: number; failed: number; blocked: number };
      passRate: number | null;
    }
  | {
      type: "diagnostico_pronto";
      run: RunRef;
      summary: string;
      causes: { title: string; cases: number; action: string }[];
    };

const hubUrl = () => process.env.QA_HUB_URL?.replace(/\/$/, "") ?? null;
const pct = (v: number | null) => (v === null ? "—" : `${String(v).replace(".", ",")}%`);

/** Mensagem do Teams (Adaptive Card 1.4) para o evento. */
export function teamsMessage(e: NotifyEvent, link: string | null) {
  const head = `${e.run.plan} · build ${e.run.build}`;
  const title = (text: string) => ({ type: "TextBlock", text, weight: "Bolder", size: "Medium", wrap: true });
  const line = (text: string, subtle = false) => ({ type: "TextBlock", text, wrap: true, ...(subtle ? { isSubtle: true, spacing: "None" } : {}) });

  const body =
    e.type === "run_concluido"
      ? [
          title(e.totals.failed || e.totals.blocked ? "⚠️ Run concluído com falhas" : "✅ Run concluído"),
          line(e.run.title),
          line(head, true),
          {
            type: "FactSet",
            facts: [
              { title: "Sucesso", value: pct(e.passRate) },
              { title: "Passou", value: String(e.totals.passed) },
              { title: "Falhou", value: String(e.totals.failed) },
              { title: "Bloqueado", value: String(e.totals.blocked) },
              { title: "Total", value: String(e.totals.total) },
            ],
          },
        ]
      : [
          title("🔎 Diagnóstico da IA pronto"),
          line(e.run.title),
          line(head, true),
          ...(e.summary ? [line(e.summary)] : []),
          ...e.causes.map((c, i) => line(`**${i + 1}. ${c.title}** (${c.cases} ${c.cases === 1 ? "caso" : "casos"})\n\n${c.action}`)),
        ];

  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          msteams: { width: "Full" },
          body,
          ...(link ? { actions: [{ type: "Action.OpenUrl", title: "Abrir no QA Hub", url: link }] } : {}),
        },
      },
    ],
  };
}

/** Dispara e esquece: nunca lança erro nem atrasa quem chamou. Sem TEAMS_WEBHOOK_URL, não faz nada. */
export function notify(event: NotifyEvent): void {
  const url = process.env.TEAMS_WEBHOOK_URL;
  if (!url) return;
  const hub = hubUrl();
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(teamsMessage(event, hub ? `${hub}/runs/${event.run.id}` : null)),
    signal: AbortSignal.timeout(10_000),
  })
    .then((res) => {
      if (!res.ok) console.error(`[avisos] Teams respondeu ${res.status} para ${event.type} do run ${event.run.id}`);
    })
    .catch((e) => console.error(`[avisos] ${event.type} do run ${event.run.id}:`, (e as Error).message));
}
