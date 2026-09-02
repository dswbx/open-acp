import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SettingsRowProps {
  title: string;
  description?: ReactNode;
  control: ReactNode;
  className?: string;
  disabled?: boolean;
}

export function SettingsRow({
  title,
  description,
  control,
  className,
  disabled,
}: SettingsRowProps) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-6 border-b border-border/60 px-4 py-3 last:border-b-0",
        disabled && "opacity-50",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1 pr-4">
        <span className="font-medium leading-tight">{title}</span>
        {description ? (
          <span className="text-sm leading-relaxed text-muted-foreground">{description}</span>
        ) : null}
      </div>
      <div
        className={cn("flex shrink-0 items-center justify-end", disabled && "pointer-events-none")}
        aria-disabled={disabled}
      >
        {control}
      </div>
    </div>
  );
}

interface SettingsGroupProps {
  title?: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SettingsGroup({ title, description, children, className }: SettingsGroupProps) {
  return (
    <section className={cn("flex flex-col gap-2", className)}>
      {title ? (
        <div className="px-1">
          <h3 className="text-base font-semibold leading-tight">{title}</h3>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
      ) : null}
      <div className="rounded-lg border border-border bg-card">{children}</div>
    </section>
  );
}
