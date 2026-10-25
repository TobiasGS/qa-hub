// Cliente JSON-RPC mínimo para os scripts (Node 20+, sem dependências).
// Usa KIWI_URL, KIWI_USER e KIWI_PASSWORD do ambiente.

export async function connect() {
  const base = (process.env.KIWI_URL ?? "https://localhost").replace(/\/$/, "");
  const user = process.env.KIWI_USER;
  const password = process.env.KIWI_PASSWORD;
  if (!user || !password) {
    console.error("Defina KIWI_USER e KIWI_PASSWORD (e KIWI_URL, se não for https://localhost).");
    process.exit(1);
  }
  const headers = { "Content-Type": "application/json" };
  if (process.env.CF_ACCESS_CLIENT_ID) {
    headers["CF-Access-Client-Id"] = process.env.CF_ACCESS_CLIENT_ID;
    headers["CF-Access-Client-Secret"] = process.env.CF_ACCESS_CLIENT_SECRET ?? "";
  }

  let id = 1;
  let session;
  async function rpc(method, ...params) {
    const res = await fetch(`${base}/json-rpc/`, {
      method: "POST",
      headers: { ...headers, ...(session ? { Cookie: `sessionid=${session}` } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", id: id++, method, params }),
    });
    if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`);
    const body = await res.json();
    if (body.error) throw new Error(`${method}: ${body.error.message}`);
    return body.result;
  }

  session = await rpc("Auth.login", user, password);
  return { rpc, user };
}
