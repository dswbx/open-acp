import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  GIT_AUTO_DELETE_LIMIT_MAX,
  GIT_AUTO_DELETE_LIMIT_MIN,
  type PullRequestMergeMethod,
} from "../../../../shared/appSettings.ts";
import { useAppSettingsStore } from "../../../state/appSettingsStore.ts";
import { SettingsGroup, SettingsRow } from "../components/SettingsRow.tsx";

export function GitSection() {
  const git = useAppSettingsStore((state) => state.settings.git);
  const updateGit = useAppSettingsStore((state) => state.updateGit);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold leading-tight">Git</h2>
        <p className="text-sm text-muted-foreground">
          Defaults for branch creation, pull requests, and worktree pruning. Some flows that consume
          these values are still being built.
        </p>
      </header>

      <SettingsGroup>
        <SettingsRow
          title="Branch prefix"
          description="Prefix used when creating new branches in open-acp."
          control={
            <Input
              value={git.branchPrefix}
              onChange={(event) => updateGit({ branchPrefix: event.target.value })}
              className="w-40"
            />
          }
        />
        <SettingsRow
          title="Pull request merge method"
          description="Choose how open-acp merges pull requests."
          control={
            <MergeMethodToggle
              value={git.pullRequestMergeMethod}
              onChange={(method) => updateGit({ pullRequestMergeMethod: method })}
            />
          }
        />
        <SettingsRow
          title="Always force push"
          description="Use --force-with-lease when pushing from open-acp."
          control={
            <Switch
              checked={git.forcePush}
              onCheckedChange={(checked: boolean) => updateGit({ forcePush: Boolean(checked) })}
            />
          }
        />
        <SettingsRow
          title="Create draft pull requests"
          description="Use draft pull requests by default when creating PRs from open-acp."
          control={
            <Switch
              checked={git.createDraftPullRequests}
              onCheckedChange={(checked: boolean) =>
                updateGit({ createDraftPullRequests: Boolean(checked) })
              }
            />
          }
        />
        <SettingsRow
          title="Automatically delete old worktrees"
          description="Recommended for most users. Turn this off only if you want to manage old worktrees and disk usage yourself."
          control={
            <Switch
              checked={git.autoDeleteOldWorktrees}
              onCheckedChange={(checked: boolean) =>
                updateGit({ autoDeleteOldWorktrees: Boolean(checked) })
              }
            />
          }
        />
        <SettingsRow
          title="Auto-delete limit"
          description="Number of worktrees to keep before older ones are pruned automatically."
          control={
            <Input
              type="number"
              min={GIT_AUTO_DELETE_LIMIT_MIN}
              max={GIT_AUTO_DELETE_LIMIT_MAX}
              value={git.autoDeleteLimit}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (!Number.isFinite(next)) return;
                const clamped = Math.min(
                  Math.max(Math.round(next), GIT_AUTO_DELETE_LIMIT_MIN),
                  GIT_AUTO_DELETE_LIMIT_MAX,
                );
                updateGit({ autoDeleteLimit: clamped });
              }}
              className="w-20"
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup
        title="Commit instructions"
        description="Added to commit message generation prompts."
      >
        <div className="p-3">
          <Textarea
            value={git.commitInstructions}
            onChange={(event) => updateGit({ commitInstructions: event.target.value })}
            placeholder="Add commit message guidance…"
            className="min-h-24"
          />
        </div>
      </SettingsGroup>

      <SettingsGroup
        title="Pull request instructions"
        description="Added to PR title/description generation prompts."
      >
        <div className="p-3">
          <Textarea
            value={git.pullRequestInstructions}
            onChange={(event) => updateGit({ pullRequestInstructions: event.target.value })}
            placeholder="Add pull request guidance…"
            className="min-h-24"
          />
        </div>
      </SettingsGroup>
    </div>
  );
}

function MergeMethodToggle({
  value,
  onChange,
}: {
  value: PullRequestMergeMethod;
  onChange: (value: PullRequestMergeMethod) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-lg border border-input bg-background p-0.5">
      {(["merge", "squash"] as const).map((option) => (
        <Button
          key={option}
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 px-3 text-xs capitalize",
            value === option && "bg-accent text-accent-foreground",
          )}
          onClick={() => onChange(option)}
        >
          {option}
        </Button>
      ))}
    </div>
  );
}
