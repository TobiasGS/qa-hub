"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, cn, inputStyles } from "./ui";

export function LoginForm({ mock }: { mock: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: form.get("username"), password: form.get("password") }),
    });
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError((await res.json()).error ?? "Falha no login");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-5 space-y-3">
      <label className="block">
        <span className="text-xs font-medium text-fg-2">Usuário</span>
        <input name="username" required autoComplete="username" defaultValue={mock ? "ana.souza" : undefined} className={cn(inputStyles, "mt-1 w-full")} />
      </label>
      {!mock && (
        <label className="block">
          <span className="text-xs font-medium text-fg-2">Senha</span>
          <input name="password" type="password" required autoComplete="current-password" className={cn(inputStyles, "mt-1 w-full")} />
        </label>
      )}
      {error && <p className="text-sm text-failed">{error}</p>}
      <Button type="submit" variant="primary" className="w-full" disabled={busy}>
        {busy && <Loader2 className="size-4 animate-spin" />} Entrar
      </Button>
    </form>
  );
}
