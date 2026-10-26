"use client";

import { LogIn, RotateCcw } from "lucide-react";
import { Button, Card } from "@/components/ui";

/**
 * Erro inesperado numa página (no lugar do "Application error" do Next).
 * A sessão expirada já volta sozinha para o login; isto cobre o resto, e ainda
 * oferece entrar de novo, que resolve quando o Kiwi recusou a sessão no meio.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card className="mx-auto mt-10 max-w-lg p-6">
      <h1 className="text-base font-semibold">Não foi possível carregar esta página</h1>
      <p className="mt-2 text-sm text-fg-2">Tente de novo. Se continuar, entre de novo no QA Hub: às vezes a sessão no Kiwi expira.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" onClick={reset}>
          <RotateCcw className="size-4" /> Tentar de novo
        </Button>
        {/* Link comum (não o do Next): a rota limpa o cookie e redireciona para o login. */}
        <a href="/api/auth/expired" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-2">
          <LogIn className="size-4" /> Entrar de novo
        </a>
      </div>
      {error.digest && <p className="mt-4 text-xs text-muted tabular">Código para suporte: {error.digest}</p>}
    </Card>
  );
}
