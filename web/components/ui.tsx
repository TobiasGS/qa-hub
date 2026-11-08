import { clsx, type ClassValue } from "clsx";
import Link from "next/link";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-border bg-surface", className)} {...props} />;
}

export function CardHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-4">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-fg-2">{description}</p>}
      </div>
      {action}
    </div>
  );
}

const buttonStyles = {
  primary: "bg-accent-solid text-accent-fg hover:opacity-90",
  secondary: "border border-border-strong bg-surface hover:bg-surface-2",
  ghost: "hover:bg-surface-2",
};

/** 36px no desktop; no celular, no mínimo 44px (alvo de toque). Um h-* passado em className continua valendo. */
const controlHeight = "h-9 max-sm:min-h-11";

type ButtonVariant = keyof typeof buttonStyles;

export function Button({ variant = "secondary", className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cn(
        controlHeight,
        "inline-flex items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition disabled:pointer-events-none disabled:opacity-50",
        buttonStyles[variant],
        className,
      )}
      {...props}
    />
  );
}

/** Classes de botão para um <a> comum (ex.: download de arquivo, que não deve passar pelo Link). */
export const buttonClass = (variant: ButtonVariant = "secondary", className?: string) =>
  cn(controlHeight, "inline-flex items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition", buttonStyles[variant], className);

export function ButtonLink({ variant = "secondary", className, ...props }: React.ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

const badgeStyles = {
  neutral: "bg-surface-2 text-fg-2",
  warn: "bg-warn-tint text-warn",
  danger: "bg-failed/15 text-failed-text",
};

export function Badge({ variant = "neutral", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof badgeStyles }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium", badgeStyles[variant], className)} {...props} />;
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-10 text-center text-sm text-muted">{children}</p>;
}

export const inputStyles = `${controlHeight} rounded-lg border border-border-strong bg-surface px-3 text-sm focus:border-accent focus-visible:outline-offset-0`;
