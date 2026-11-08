"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#1f6bc4] px-3 text-sm font-medium text-white hover:opacity-90 print:hidden"
    >
      <Printer className="size-4" aria-hidden /> Imprimir / salvar PDF
    </button>
  );
}
