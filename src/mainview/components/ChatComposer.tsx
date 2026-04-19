import React, { useEffect, useRef } from "react";
import { EditorContent, ReactRenderer, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Mention from "@tiptap/extension-mention";
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import { Markdown } from "tiptap-markdown";
import { cn } from "@/lib/utils";
import type { SmokeBridge } from "../bridge/SmokeBridge.ts";
import type { AvailableCommand } from "../../shared/AppRPC.ts";
import {
   MentionList,
   type MentionItem,
   type MentionListRef,
} from "./MentionList.tsx";
import {
   CommandList,
   type CommandItem,
   type CommandListRef,
} from "./CommandList.tsx";
import {
   filterWorkspaceIndex,
   loadWorkspaceIndex,
} from "./workspaceFileIndex.ts";

interface ChatComposerProps {
   value: string;
   disabled?: boolean;
   placeholder?: string;
   bridge: SmokeBridge;
   cwd?: string;
   availableCommands?: AvailableCommand[];
   onChange: (markdown: string) => void;
   onSubmit: () => void;
   className?: string;
}

function buildMentionSuggestion(
   bridgeRef: React.RefObject<SmokeBridge>,
   cwdRef: React.RefObject<string | undefined>,
): Omit<SuggestionOptions<MentionItem>, "editor"> {
   return {
      char: "@",
      allowSpaces: false,
      items: async ({ query }) => {
         const cwd = cwdRef.current;
         const bridge = bridgeRef.current;
         if (!bridge || !cwd) return [];
         try {
            const index = await loadWorkspaceIndex(bridge, cwd);
            return filterWorkspaceIndex(index, query);
         } catch {
            return [];
         }
      },
      render: () => {
         let component: ReactRenderer<MentionListRef> | null = null;
         let popup: TippyInstance[] | null = null;

         return {
            onStart: (props: SuggestionProps<MentionItem>) => {
               component = new ReactRenderer(MentionList, {
                  props,
                  editor: props.editor,
               });
               if (!props.clientRect) return;
               popup = tippy("body", {
                  getReferenceClientRect: () =>
                     props.clientRect?.() ?? new DOMRect(0, 0, 0, 0),
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: "manual",
                  placement: "top-start",
               });
            },
            onUpdate: (props) => {
               component?.updateProps(props);
               if (!props.clientRect) return;
               popup?.[0]?.setProps({
                  getReferenceClientRect: () =>
                     props.clientRect?.() ?? new DOMRect(0, 0, 0, 0),
               });
            },
            onKeyDown: (props) => {
               if (props.event.key === "Escape") {
                  popup?.[0]?.hide();
                  return true;
               }
               return component?.ref?.onKeyDown(props) ?? false;
            },
            onExit: () => {
               popup?.[0]?.destroy();
               component?.destroy();
               popup = null;
               component = null;
            },
         };
      },
   };
}

const FileMention = Mention.extend({
   addStorage() {
      return {
         markdown: {
            serialize(state: any, node: any) {
               state.write(`@${node.attrs.id}`);
            },
            parse: {},
         },
      };
   },
   renderText({ node }) {
      return `@${node.attrs.id}`;
   },
});

const CommandMention = Mention.extend({
   name: "commandMention",
   addStorage() {
      return {
         markdown: {
            serialize(state: any, node: any) {
               state.write(`/${node.attrs.id}`);
            },
            parse: {},
         },
      };
   },
   renderText({ node }) {
      return `/${node.attrs.id}`;
   },
});

function buildCommandSuggestion(
   commandsRef: React.RefObject<AvailableCommand[] | undefined>,
): Omit<SuggestionOptions<CommandItem>, "editor"> {
   return {
      char: "/",
      allowSpaces: false,
      startOfLine: true,
      items: ({ query }) => {
         const commands = commandsRef.current ?? [];
         const lowered = query.toLowerCase();
         return commands
            .filter((cmd) => cmd.name.toLowerCase().startsWith(lowered))
            .slice(0, 50)
            .map((cmd) => ({
               id: cmd.name,
               label: cmd.name,
               description: cmd.description,
               inputHint: cmd.inputHint,
            }));
      },
      render: () => {
         let component: ReactRenderer<CommandListRef> | null = null;
         let popup: TippyInstance[] | null = null;

         return {
            onStart: (props: SuggestionProps<CommandItem>) => {
               component = new ReactRenderer(CommandList, {
                  props,
                  editor: props.editor,
               });
               if (!props.clientRect) return;
               popup = tippy("body", {
                  getReferenceClientRect: () =>
                     props.clientRect?.() ?? new DOMRect(0, 0, 0, 0),
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: "manual",
                  placement: "top-start",
               });
            },
            onUpdate: (props) => {
               component?.updateProps(props);
               if (!props.clientRect) return;
               popup?.[0]?.setProps({
                  getReferenceClientRect: () =>
                     props.clientRect?.() ?? new DOMRect(0, 0, 0, 0),
               });
            },
            onKeyDown: (props) => {
               if (props.event.key === "Escape") {
                  popup?.[0]?.hide();
                  return true;
               }
               return component?.ref?.onKeyDown(props) ?? false;
            },
            onExit: () => {
               popup?.[0]?.destroy();
               component?.destroy();
               popup = null;
               component = null;
            },
         };
      },
   };
}

export function ChatComposer({
   value,
   disabled,
   placeholder,
   bridge,
   cwd,
   availableCommands,
   onChange,
   onSubmit,
   className,
}: ChatComposerProps) {
   const bridgeRef = useRef(bridge);
   const cwdRef = useRef(cwd);
   const onSubmitRef = useRef(onSubmit);
   const commandsRef = useRef<AvailableCommand[] | undefined>(availableCommands);

   bridgeRef.current = bridge;
   cwdRef.current = cwd;
   onSubmitRef.current = onSubmit;
   commandsRef.current = availableCommands;

   const editor = useEditor({
      immediatelyRender: false,
      extensions: [
         StarterKit.configure({
            heading: false,
            blockquote: false,
            horizontalRule: false,
            bulletList: false,
            orderedList: false,
            listItem: false,
         }),
         Placeholder.configure({
            placeholder:
               placeholder ?? "Type a prompt. Use @ to mention files.",
         }),
         Link.configure({
            openOnClick: false,
            autolink: true,
            linkOnPaste: true,
            HTMLAttributes: {
               class: "text-primary underline underline-offset-2",
            },
         }),
         FileMention.configure({
            HTMLAttributes: {
               class:
                  "inline-flex items-center rounded bg-accent px-1 py-0.5 font-mono text-[0.85em] text-accent-foreground",
            },
            suggestion: buildMentionSuggestion(bridgeRef, cwdRef),
         }),
         CommandMention.configure({
            HTMLAttributes: {
               class:
                  "inline-flex items-baseline rounded bg-primary/15 px-1 py-0 align-baseline font-mono text-[0.85em] font-medium text-primary",
            },
            suggestion: buildCommandSuggestion(commandsRef),
         }),
         Markdown.configure({
            html: false,
            tightLists: true,
            linkify: true,
            breaks: true,
            transformPastedText: true,
            transformCopiedText: false,
         }),
      ],
      editorProps: {
         attributes: {
            class: cn(
               "min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
               "prose prose-sm max-w-none dark:prose-invert",
               "[&_p]:my-0 [&_p]:leading-relaxed",
               "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em]",
               "[&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:font-mono [&_pre]:text-xs [&_pre_code]:bg-transparent [&_pre_code]:p-0",
            ),
         },
         handleKeyDown: (_view, event) => {
            if (event.key === "Enter" && !event.shiftKey) {
               event.preventDefault();
               onSubmitRef.current();
               return true;
            }
            return false;
         },
      },
      onUpdate: ({ editor }) => {
         const markdown = (editor.storage as any).markdown?.getMarkdown?.() ?? "";
         onChange(markdown);
      },
      content: value,
   });

   useEffect(() => {
      if (!editor) return;
      const current = (editor.storage as any).markdown?.getMarkdown?.() ?? "";
      if (value === "" && current !== "") {
         editor.commands.clearContent(false);
      }
   }, [editor, value]);

   useEffect(() => {
      if (!editor) return;
      editor.setEditable(!disabled);
   }, [editor, disabled]);

   const resolvedPlaceholder =
      placeholder ?? "Type a prompt. Use @ to mention files.";
   return (
      <EditorContent
         editor={editor}
         aria-label={resolvedPlaceholder}
         data-placeholder={resolvedPlaceholder}
         className={cn(
            disabled ? "pointer-events-none opacity-60" : "",
            className,
         )}
      />
   );
}
