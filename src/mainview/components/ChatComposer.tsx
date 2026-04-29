import React, { useEffect, useRef } from "react";
import { TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
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
import { MentionList, type MentionItem, type MentionListRef } from "./MentionList.tsx";
import { CommandList, type CommandItem, type CommandListRef } from "./CommandList.tsx";
import {
  getChatComposerPlaceholder,
  getComposerEnterAction,
  parseCodeFenceLanguage,
} from "./chatComposerUtils.ts";
import { filterWorkspaceIndex, loadWorkspaceIndex } from "./workspaceFileIndex.ts";
import { useAppSettingsStore } from "../state/appSettingsStore.ts";

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

interface MarkdownSerializerState {
  write: (content: string) => void;
}

interface MentionNodeLike {
  attrs: {
    id: string;
  };
}

interface MarkdownStorage {
  markdown?: {
    getMarkdown?: () => string;
  };
}

function convertFenceParagraphToCodeBlock(view: EditorView): boolean {
  const { state, dispatch } = view;
  const { selection, schema } = state;
  const { $from, empty } = selection;

  if (!empty || $from.parent.type.name !== "paragraph") {
    return false;
  }

  const language = parseCodeFenceLanguage($from.parent.textContent);
  if (language === null || $from.parentOffset !== $from.parent.content.size) {
    return false;
  }

  const codeBlock = schema.nodes.codeBlock;
  if (!codeBlock) {
    return false;
  }

  const blockStart = $from.before();
  const blockEnd = $from.after();
  const contentStart = $from.start();
  const contentEnd = $from.end();
  const tr = state.tr;

  tr.setBlockType(blockStart, blockEnd, codeBlock, {
    language: language || null,
  });
  tr.delete(contentStart, contentEnd);
  tr.setSelection(TextSelection.create(tr.doc, contentStart));
  dispatch(tr.scrollIntoView());
  return true;
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
            getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect(0, 0, 0, 0),
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
            getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect(0, 0, 0, 0),
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
        serialize(state: MarkdownSerializerState, node: MentionNodeLike) {
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
        serialize(state: MarkdownSerializerState, node: MentionNodeLike) {
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
            getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect(0, 0, 0, 0),
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
            getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect(0, 0, 0, 0),
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
  const requireCmdEnter = useAppSettingsStore(
    (state) => state.settings.general.requireCmdEnterForLongPrompts,
  );
  const requireCmdEnterRef = useRef(requireCmdEnter);

  bridgeRef.current = bridge;
  cwdRef.current = cwd;
  onSubmitRef.current = onSubmit;
  commandsRef.current = availableCommands;
  requireCmdEnterRef.current = requireCmdEnter;

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
        placeholder: getChatComposerPlaceholder(placeholder),
        showOnlyWhenEditable: false,
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
            "whitespace-nowrap rounded-md border border-primary/30 bg-primary/15 px-1.5 font-mono text-[0.85em] font-medium text-primary",
        },
        suggestion: buildMentionSuggestion(bridgeRef, cwdRef),
      }),
      CommandMention.configure({
        HTMLAttributes: {
          class:
            "whitespace-nowrap rounded-md bg-muted px-1 font-mono text-[0.85em] text-muted-foreground",
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
          "min-h-20 w-full px-5 py-4.5 text-sm text-foreground focus:outline-none text-md",
          "prose prose-sm max-w-none dark:prose-invert",
          "[&_p]:my-0 [&_p]:leading-relaxed",
          "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em]",
          "[&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:font-mono [&_pre]:text-xs [&_pre_code]:bg-transparent [&_pre_code]:p-0",
        ),
      },
      handleKeyDown: (_view, event) => {
        const action = getComposerEnterAction({
          key: event.key,
          shiftKey: event.shiftKey,
          metaKey: event.metaKey || event.ctrlKey,
          selectionEmpty: _view.state.selection.empty,
          parentNodeType: _view.state.selection.$from.parent.type.name,
          parentText: _view.state.selection.$from.parent.textContent,
          isAtEndOfBlock:
            _view.state.selection.$from.parentOffset ===
            _view.state.selection.$from.parent.content.size,
          isMultiline: _view.state.doc.childCount > 1,
          requireCmdEnterForLongPrompts: requireCmdEnterRef.current,
        });

        if (action === "convertFence") {
          event.preventDefault();
          return convertFenceParagraphToCodeBlock(_view);
        }

        if (action === "submit") {
          event.preventDefault();
          onSubmitRef.current();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      const markdown = (editor.storage as MarkdownStorage).markdown?.getMarkdown?.() ?? "";
      onChange(markdown);
    },
    content: value,
  });

  useEffect(() => {
    if (!editor) return;
    const current = (editor.storage as MarkdownStorage).markdown?.getMarkdown?.() ?? "";
    if (value === "" && current !== "") {
      editor.commands.clearContent(false);
    }
  }, [editor, value]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  const resolvedPlaceholder = getChatComposerPlaceholder(placeholder);

  return (
    <EditorContent
      editor={editor}
      aria-label={resolvedPlaceholder}
      className={cn(
        // tiptap v3 placeholder extension sets data-placeholder on empty blocks; styles are not bundled
        "[&_[data-placeholder]::before]:pointer-events-none",
        "[&_[data-placeholder]::before]:float-left",
        "[&_[data-placeholder]::before]:h-0",
        "[&_[data-placeholder]::before]:text-muted-foreground",
        "[&_[data-placeholder]::before]:content-[attr(data-placeholder)]",
        "[&_.is-editor-empty_[data-placeholder]::before]:opacity-100",
        disabled ? "pointer-events-none opacity-60" : "",
        className,
      )}
    />
  );
}
