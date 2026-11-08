import "server-only";
import { workflowUrl } from "./n8n";

// Avisos para o canal do Teams, via n8n (n8n/qahub-avisos.workflow.json). O QA Hub só manda o
// evento; o n8n monta o cartão e posta no webhook do Teams (a URL do Teams fica no n8n).
//   N8N_NOTIFY_URL  opcional; sem ele, usa o mesmo n8n do N8N_WEBHOOK_URL (/webhook/qahub-avisos)
//   QA_HUB_URL      endereço público do QA Hub, para os links do cartão

export type NotifyEvent =
  | {
      type: "run_concluido";
      run: { id: number; title: string; plan: string; build: string };
      totals: { total: number; passed: number; failed: number; blocked: number };
      passRate: number | null;
    }
  | {
      type: "diagnostico_pronto";
      run: { id: number; title: string; plan: string; build: string };
      summary: string;
      causes: { title: string; cases: number; action: string }[];
    };

export const notifyUrl = () => workflowUrl(process.env.N8N_NOTIFY_URL, "qahub-avisos");

const hubUrl = () => process.env.QA_HUB_URL?.replace(/\/$/, "") ?? null;

/** Dispara e esquece: nunca lança erro nem atrasa quem chamou além de montar o pedido. */
export function notify(event: NotifyEvent): void {
  const url = notifyUrl();
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!url || !secret) return;
  const hub = hubUrl();
  const body = { ...event, link: hub ? `${hub}/runs/${event.run.id}` : null, at: new Date().toISOString() };
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-QAHub-Secret": secret },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  })
    .then((res) => {
      if (!res.ok) console.error(`[avisos] n8n respondeu ${res.status} para ${event.type} do run ${event.run.id}`);
    })
    .catch((e) => console.error(`[avisos] ${event.type} do run ${event.run.id}:`, (e as Error).message));
}
