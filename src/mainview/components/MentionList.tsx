import React, { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { cn } from "@/lib/utils";
import { File, Folder } from "lucide-react";

export interface MentionItem {
  id: string;
  label: string;
  kind: "file" | "directory";
}

export interface MentionListRef {
  onKeyDown: (params: { event: KeyboardEvent }) => boolean;
}

interface MentionListProps {
  items: MentionItem[];
  command: (item: MentionItem) => void;
}

export const MentionList = forwardRef<MentionListRef, MentionListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    const selectItem = (index: number) => {
      const item = items[index];
      if (item) command(item);
    };

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex((selectedIndex + items.length - 1) % items.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((selectedIndex + 1) % items.length);
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-md">
          No matches
        </div>
      );
    }

    return (
      <div className="max-h-72 w-72 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
        {items.map((item, index) => (
          <button
            key={`${item.kind}:${item.id}`}
            type="button"
            onMouseEnter={() => setSelectedIndex(index)}
            onClick={() => selectItem(index)}
            className={cn(
              "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs",
              index === selectedIndex
                ? "bg-accent text-accent-foreground"
                : "text-foreground/90 hover:bg-accent/60",
            )}
          >
            {item.kind === "directory" ? (
              <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate font-mono">{item.label}</span>
          </button>
        ))}
      </div>
    );
  },
);

MentionList.displayName = "MentionList";
