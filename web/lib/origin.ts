import "server-only";

/** Endereço público do QA Hub (QA_HUB_URL) ou, sem ele, a origem da requisição. Usado nos links enviados ao Azure. */
export const hubOrigin = (req: Request) => (process.env.QA_HUB_URL ?? new URL(req.url).origin).replace(/\/$/, "");
