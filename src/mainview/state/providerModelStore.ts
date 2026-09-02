import { create } from "zustand";
import type { ProviderModelCatalog, SmokeProvider } from "../../shared/AppRPC.ts";
import {
  createInitialProviderModelCatalogs,
  getSelectedModelValue,
} from "../providerModelCatalogState.ts";

interface ProviderModelState {
  catalogs: Record<SmokeProvider, ProviderModelCatalog>;
  selected: Record<SmokeProvider, string>;
  setCatalog: (provider: SmokeProvider, catalog: ProviderModelCatalog) => void;
  setSelectedModel: (provider: SmokeProvider, value: string) => void;
  reset: () => void;
}

function createInitialState() {
  return {
    catalogs: createInitialProviderModelCatalogs(),
    selected: {
      codex: "",
      cursor: "",
      claude: "",
      qwen: "",
      opencode: "",
    },
  };
}

export const useProviderModelStore = create<ProviderModelState>((set) => ({
  ...createInitialState(),
  setCatalog: (provider, catalog) => {
    set((state) => ({
      catalogs: { ...state.catalogs, [provider]: catalog },
      selected: {
        ...state.selected,
        [provider]:
          catalog.models.length === 0
            ? state.selected[provider]
            : getSelectedModelValue(state.selected[provider], catalog),
      },
    }));
  },
  setSelectedModel: (provider, value) => {
    set((state) => ({
      selected: { ...state.selected, [provider]: value },
    }));
  },
  reset: () => set(createInitialState()),
}));
