// n8n falso que responde depois de 320 s; compara o fetch padrão com o Agent do QA Hub.
import http from "node:http";
import { Agent, fetch as undiciFetch } from "undici";
const DELAY = 320_000;
http.createServer((req, res) => setTimeout(() => { res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"ok":true}'); }, DELAY)).listen(9096);
const t0 = Date.now();
const secs = () => Math.round((Date.now() - t0) / 1000);
const padrao = fetch("http://localhost:9096", { method: "POST", body: "{}", signal: AbortSignal.timeout(600_000) }).then(r => `ok ${r.status}`, e => `erro (${e.cause?.code ?? e.name})`).then(r => console.log(`fetch padrão: ${r} em ${secs()} s`));
const corrigido = undiciFetch("http://localhost:9096", { method: "POST", body: "{}", dispatcher: new Agent({ headersTimeout: 600_000, bodyTimeout: 600_000 }), signal: AbortSignal.timeout(600_000) }).then(r => `ok ${r.status}`, e => `erro (${e.cause?.code ?? e.name})`).then(r => console.log(`com o Agent do QA Hub: ${r} em ${secs()} s`));
await Promise.all([padrao, corrigido]);
process.exit(0);
