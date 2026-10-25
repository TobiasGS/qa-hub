import { NextResponse } from "next/server";
import { ApiError, apiRoute, readJson } from "@/lib/api";
import { SCOPE_COOKIE } from "@/lib/session";

/** Admin escolhe o que ver: { scope: "all" | "mine" }. Para usuário comum não muda nada. */
export const POST = apiRoute(async ({ viewer }, req) => {
  if (!viewer.isAdmin) throw new ApiError("Só administradores escolhem o que ver", 403);
  const scope = (await readJson(req)).scope === "mine" ? "mine" : "all";
  const res = NextResponse.json({ scope });
  res.cookies.set(SCOPE_COOKIE, scope, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
});
