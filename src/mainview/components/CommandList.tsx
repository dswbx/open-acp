import React, {
   forwardRef,
   useEffect,
   useImperativeHandle,
   useState,
} from "react";
import { cn } from "@/lib/utils";
import { Slash } from "lucide-react";

export interface CommandItem {
   id: string;
   label: string;
   description?: string;
   inputHint?: string;
}

export interface CommandListRef {
   onKeyDown: (params: { event: KeyboardEvent }) => boolean;
}

interface CommandListProps {
   items: CommandItem[];
   command: (item: CommandItem) => void;
}

export const CommandList = forwardRef<CommandListRef, CommandListProps>(
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
               setSelectedIndex(
                  (selectedIndex + items.length - 1) % items.length,
               );
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
               No commands available
            </div>
         );
      }

      return (
         <div className="max-h-72 w-80 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
            {items.map((item, index) => (
               <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => selectItem(index)}
                  className={cn(
                     "flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs",
                     index === selectedIndex
                        ? "bg-accent text-accent-foreground"
                        : "text-foreground/90 hover:bg-accent/60",
                  )}
               >
                  <Slash className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                     <span className="flex items-baseline gap-2">
                        <span className="truncate font-mono">
                           /{item.label}
                        </span>
                        {item.inputHint ? (
                           <span className="truncate text-[10px] text-muted-foreground">
                              {item.inputHint}
                           </span>
                        ) : null}
                     </span>
                     {item.description ? (
                        <span className="mt-0.5 line-clamp-2 block text-muted-foreground">
                           {item.description}
                        </span>
                     ) : null}
                  </span>
               </button>
            ))}
         </div>
      );
   },
);

CommandList.displayName = "CommandList";
