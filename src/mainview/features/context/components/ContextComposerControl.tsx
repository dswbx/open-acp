import type { LanguageModelUsage } from "ai";

import {
  Context,
  ContextCacheUsage,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextReasoningUsage,
  ContextTrigger,
} from "@/components/ai-elements/context";

import type { SessionContextUsage } from "../state/contextStore.ts";

interface ContextComposerControlProps {
  usage?: SessionContextUsage;
  fallbackMaxTokens?: number | null;
  modelId?: string;
  modelLabel?: string;
}

function hasUsageBreakdown(usage: SessionContextUsage | undefined): boolean {
  if (!usage) {
    return false;
  }

  return [
    usage.inputTokens,
    usage.outputTokens,
    usage.reasoningTokens,
    usage.cachedInputTokens,
  ].some((value) => typeof value === "number" && value > 0);
}

function toLanguageModelUsage(
  usage: SessionContextUsage | undefined,
): LanguageModelUsage | undefined {
  if (!usage || !hasUsageBreakdown(usage)) {
    return undefined;
  }

  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;

  return {
    inputTokens,
    inputTokenDetails: {
      noCacheTokens:
        inputTokens > 0 ? Math.max(inputTokens - (usage.cachedInputTokens ?? 0), 0) : undefined,
      cacheReadTokens: usage.cachedInputTokens ?? undefined,
      cacheWriteTokens: undefined,
    },
    outputTokens,
    outputTokenDetails: {
      textTokens: outputTokens > 0 ? outputTokens : undefined,
      reasoningTokens: usage.reasoningTokens ?? undefined,
    },
    reasoningTokens: usage.reasoningTokens ?? 0,
    cachedInputTokens: usage.cachedInputTokens ?? 0,
    totalTokens: inputTokens + outputTokens,
  };
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right font-mono text-[11px]">{value}</span>
    </div>
  );
}

export function ContextComposerControl({
  usage,
  fallbackMaxTokens,
  modelId,
  modelLabel,
}: ContextComposerControlProps) {
  const maxTokens = usage?.size ?? fallbackMaxTokens ?? 0;
  if (!Number.isFinite(maxTokens) || maxTokens <= 0) {
    return null;
  }

  const resolvedModelId = usage?.modelId ?? modelId;
  const resolvedUsage = toLanguageModelUsage(usage);
  const showFooter = Boolean(resolvedModelId && resolvedUsage);

  return (
    <Context
      maxTokens={maxTokens}
      modelId={resolvedModelId}
      openDelay={75}
      usage={resolvedUsage}
      usedTokens={usage?.used ?? 0}
    >
      <ContextTrigger
        className="h-9 rounded-full px-3 text-muted-foreground hover:text-foreground"
        size="sm"
        variant="ghost"
      />
      <ContextContent align="start" className="w-72" side="top">
        <ContextContentHeader />
        <ContextContentBody className="space-y-2.5">
          {modelLabel || resolvedModelId ? (
            <MetaRow label="Model" value={modelLabel ?? resolvedModelId ?? ""} />
          ) : null}
          <ContextInputUsage />
          <ContextOutputUsage />
          <ContextReasoningUsage />
          <ContextCacheUsage />
        </ContextContentBody>
        {showFooter ? <ContextContentFooter /> : null}
      </ContextContent>
    </Context>
  );
}
