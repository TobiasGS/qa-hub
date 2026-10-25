"use client";

import { Loader2 } from "lucide-react";
import { Button, cn, inputStyles } from "./ui";

export function Field({ label, hint, className, children }: { label: string; hint?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("block", className)}>
      <span className="text-xs font-medium text-fg-2">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputStyles, "w-full", props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={5} {...props} className={cn(inputStyles, "h-auto w-full py-2 leading-relaxed", props.className)} />;
}

export function Select({ options, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string | number; label: string }[] }) {
  return (
    <select {...props} className={cn(inputStyles, "w-full", props.className)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function FormFooter({
  busy,
  disabled,
  error,
  submitLabel,
  onCancel,
}: {
  busy: boolean;
  disabled?: boolean;
  error: string | null;
  submitLabel: string;
  onCancel: () => void;
}) {
  return (
    <>
      {error && <p className="mt-4 text-sm text-failed">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={busy || disabled}>
          {busy && <Loader2 className="size-4 animate-spin" />} {submitLabel}
        </Button>
      </div>
    </>
  );
}
