import React from "react";
import { Button } from "../../components/ui/button.tsx";
import type { ApprovalEventPayload, ApprovalOption, ApprovalOutcome } from "../../shared/AppRPC.ts";
import { cn } from "../../lib/utils.ts";
import { formatToolPresentation } from "../chat/toolPresentation.ts";
import { CheckIcon, FilePenIcon, GlobeIcon, TerminalIcon, XIcon } from "lucide-react";

export type PendingApproval = Extract<ApprovalEventPayload, { kind: "requested" }>;

interface PermissionApprovalCardProps {
  approval: PendingApproval;
  isResponding: boolean;
  onSelectOption: (optionId: string) => void;
}

interface ApprovalDisplay {
  title: string;
  kindLabel: string;
  bodyText?: string;
  cwd: string;
  locations: PendingApproval["locations"];
  icon: React.ReactNode;
  iconClassName: string;
  isCommand: boolean;
}

type OptionStyle = {
  variant: "default" | "outline" | "secondary" | "ghost" | "destructive";
  className?: string;
  icon?: React.ReactNode;
  order: number;
};

const COMMAND_TOOL_KINDS = new Set(["bash", "command_execution", "functions.exec_command"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonString(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function getCommandText(rawInput?: string): string | undefined {
  if (!rawInput) return undefined;
  const parsed = parseJsonString(rawInput);
  if (isRecord(parsed) && typeof parsed.cmd === "string") {
    return parsed.cmd;
  }
  const trimmed = rawInput.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeOptionText(option: ApprovalOption): string {
  return `${option.kind} ${option.name}`.toLowerCase();
}

function isRejectLike(option: ApprovalOption): boolean {
  const text = normalizeOptionText(option);
  return text.includes("reject") || text.includes("deny") || text.includes("decline");
}

export function selectRejectionOutcome(approval: PendingApproval): ApprovalOutcome {
  const rejectOnce = approval.options.find((option) => option.kind === "reject_once");
  const rejectAlways = approval.options.find((option) => option.kind === "reject_always");
  const rejectLike = approval.options.find(isRejectLike);
  const selected = rejectOnce ?? rejectAlways ?? rejectLike;
  return selected ? { outcome: "selected", optionId: selected.optionId } : { outcome: "cancelled" };
}

export function getApprovalOptionStyle(option: ApprovalOption): OptionStyle {
  if (option.kind === "allow_once") {
    return {
      variant: "default",
      className: "gap-1.5",
      icon: <CheckIcon className="size-3.5" />,
      order: 0,
    };
  }
  if (option.kind === "allow_always") {
    return { variant: "outline", order: 1 };
  }
  if (option.kind === "reject_once") {
    return {
      variant: "ghost",
      className: "text-muted-foreground hover:text-foreground",
      icon: <XIcon className="size-3.5" />,
      order: 2,
    };
  }
  if (option.kind === "reject_always") {
    return { variant: "destructive", order: 3 };
  }
  return { variant: isRejectLike(option) ? "ghost" : "outline", order: 4 };
}

export function getApprovalDisplay(approval: PendingApproval): ApprovalDisplay {
  const commandText = getCommandText(approval.rawInput);
  const isCommand = COMMAND_TOOL_KINDS.has(approval.toolKind ?? "") && Boolean(commandText);

  if (isCommand) {
    return {
      title: "Run shell command?",
      kindLabel: "Shell command",
      bodyText: commandText,
      cwd: approval.cwd,
      locations: approval.locations,
      icon: <TerminalIcon className="size-3.5" />,
      iconClassName: "bg-amber-500/15 text-amber-300",
      isCommand: true,
    };
  }

  const presentation = formatToolPresentation({
    toolCallId: approval.toolCallId,
    toolKind: approval.toolKind,
    input: approval.rawInput,
    locations: approval.locations,
  });
  const lowerKind = (approval.toolKind ?? "").toLowerCase();
  const isNetworkLike =
    lowerKind.includes("mcp") || lowerKind.includes("network") || lowerKind.includes("http");
  const isFileLike = Boolean(presentation.fileChange) || lowerKind.includes("file");

  return {
    title: `${presentation.title}?`,
    kindLabel: isNetworkLike ? "Tool call" : isFileLike ? "File change" : "Permission request",
    bodyText: approval.rawInput?.trim() || undefined,
    cwd: approval.cwd,
    locations: approval.locations,
    icon: isNetworkLike ? <GlobeIcon className="size-3.5" /> : <FilePenIcon className="size-3.5" />,
    iconClassName: isNetworkLike
      ? "bg-violet-500/15 text-violet-300"
      : "bg-primary/15 text-primary",
    isCommand: false,
  };
}

function formatLocation(location: PendingApproval["locations"][number]): string {
  return typeof location.line === "number" ? `${location.path}:${location.line}` : location.path;
}

export function PermissionApprovalCard({
  approval,
  isResponding,
  onSelectOption,
}: PermissionApprovalCardProps): React.ReactNode {
  const display = getApprovalDisplay(approval);
  const sortedOptions = [...approval.options].sort((a, b) => {
    const aStyle = getApprovalOptionStyle(a);
    const bStyle = getApprovalOptionStyle(b);
    return aStyle.order - bStyle.order;
  });

  return (
    <section
      aria-label="Permission approval"
      className="mx-4 mb-3 rounded-xl border border-border/80 bg-card/95 p-3.5 text-card-foreground shadow-2xl shadow-black/30 backdrop-blur supports-[backdrop-filter]:bg-card/90"
    >
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-md",
            display.iconClassName,
          )}
        >
          {display.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h2 className="text-sm font-medium leading-5">{display.title}</h2>
            <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
              in <span className="text-foreground/70">{display.cwd}</span>
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{display.kindLabel}</p>
        </div>
      </div>

      {display.bodyText ? (
        <pre
          className={cn(
            "mt-3 max-h-44 overflow-auto rounded-md border border-border bg-background/80 px-3 py-2 font-mono text-xs leading-relaxed text-foreground",
            display.isCommand ? "whitespace-pre" : "whitespace-pre-wrap",
          )}
        >
          {display.isCommand ? <span className="select-none text-muted-foreground">$ </span> : null}
          {display.bodyText}
        </pre>
      ) : null}

      {display.locations.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {display.locations.map((location) => (
            <span
              className="max-w-full truncate rounded-md border border-border bg-muted/40 px-2 py-1 font-mono text-[11px] text-muted-foreground"
              key={formatLocation(location)}
              title={formatLocation(location)}
            >
              {formatLocation(location)}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {sortedOptions.map((option) => {
          const style = getApprovalOptionStyle(option);
          return (
            <Button
              className={style.className}
              disabled={isResponding}
              key={option.optionId}
              onClick={() => onSelectOption(option.optionId)}
              size="sm"
              variant={style.variant}
            >
              {style.icon}
              {isResponding ? "Working..." : option.name}
            </Button>
          );
        })}
        <div className="min-w-48 flex-1" />
        <span className="text-right text-[11px] leading-4 text-muted-foreground">
          Or tell open-acp what to do differently below
        </span>
      </div>
    </section>
  );
}
