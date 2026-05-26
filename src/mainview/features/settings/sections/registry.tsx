import {
  Archive,
  BarChart3,
  Box,
  GaugeCircle,
  GitBranch,
  Globe,
  Laptop2,
  Layers,
  Palette,
  Server,
  Settings as SettingsIcon,
  User,
} from "lucide-react";
import type { ComponentType } from "react";
import type { SmokeBridge } from "../../../bridge/SmokeBridge.ts";
import { AppearanceSection } from "./AppearanceSection.tsx";
import { GeneralSection } from "./GeneralSection.tsx";
import { GitSection } from "./GitSection.tsx";
import { StubSection } from "./StubSection.tsx";

export type SettingsSectionId =
  | "general"
  | "appearance"
  | "configuration"
  | "personalization"
  | "mcp-servers"
  | "git"
  | "environments"
  | "worktrees"
  | "browser-use"
  | "computer-use"
  | "archived-chats"
  | "usage";

export interface SettingsSection {
  id: SettingsSectionId;
  label: string;
  icon: ComponentType<{ className?: string }>;
  Component: ComponentType<{ smokeBridge?: SmokeBridge }>;
  disabled?: boolean;
}

const ConfigurationStub = () => <StubSection title="Configuration" />;
const PersonalizationStub = () => <StubSection title="Personalization" />;
const McpServersStub = () => <StubSection title="MCP servers" />;
const EnvironmentsStub = () => <StubSection title="Environments" />;
const WorktreesStub = () => <StubSection title="Worktrees" />;
const BrowserUseStub = () => <StubSection title="Browser use" />;
const ComputerUseStub = () => <StubSection title="Computer use" />;
const ArchivedChatsStub = () => <StubSection title="Archived chats" />;
const UsageStub = () => <StubSection title="Usage" />;

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { id: "general", label: "General", icon: SettingsIcon, Component: GeneralSection },
  { id: "appearance", label: "Appearance", icon: Palette, Component: AppearanceSection },
  { id: "git", label: "Git", icon: GitBranch, Component: GitSection },
  {
    id: "configuration",
    label: "Configuration",
    icon: GaugeCircle,
    Component: ConfigurationStub,
    disabled: true,
  },
  {
    id: "personalization",
    label: "Personalization",
    icon: User,
    Component: PersonalizationStub,
    disabled: true,
  },
  {
    id: "mcp-servers",
    label: "MCP servers",
    icon: Server,
    Component: McpServersStub,
    disabled: true,
  },
  {
    id: "environments",
    label: "Environments",
    icon: Layers,
    Component: EnvironmentsStub,
    disabled: true,
  },
  {
    id: "worktrees",
    label: "Worktrees",
    icon: Box,
    Component: WorktreesStub,
    disabled: true,
  },
  {
    id: "browser-use",
    label: "Browser use",
    icon: Globe,
    Component: BrowserUseStub,
    disabled: true,
  },
  {
    id: "computer-use",
    label: "Computer use",
    icon: Laptop2,
    Component: ComputerUseStub,
    disabled: true,
  },
  {
    id: "archived-chats",
    label: "Archived chats",
    icon: Archive,
    Component: ArchivedChatsStub,
    disabled: true,
  },
  { id: "usage", label: "Usage", icon: BarChart3, Component: UsageStub, disabled: true },
];

export const DEFAULT_SETTINGS_SECTION_ID: SettingsSectionId = "general";

export function getSettingsSection(id: SettingsSectionId): SettingsSection {
  return SETTINGS_SECTIONS.find((section) => section.id === id) ?? SETTINGS_SECTIONS[0];
}
