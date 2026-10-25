"use client";

import { Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, cn } from "./ui";

/** Modal com o <dialog> nativo: foco preso, Esc fecha e o fundo escurece. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  wide,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className={cn(
        "m-auto w-[calc(100vw-32px)] rounded-xl border border-border bg-surface p-0 text-fg shadow-xl backdrop:bg-black/50",
        wide ? "max-w-3xl" : "max-w-lg",
      )}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-base font-semibold">{title}</h2>
              {description && <p className="mt-0.5 text-sm text-fg-2">{description}</p>}
            </div>
            <button onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Fechar">
              <X className="size-4" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}

/** Confirmação para ações sensíveis (arquivar, remover, desativar). */
export function ConfirmDialog({
  open,
  onClose,
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="text-sm text-fg-2">{message}</div>
      {error && <p className="mt-3 text-sm text-failed">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button variant="primary" className={danger ? "bg-failed" : undefined} onClick={confirm} disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />} {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
