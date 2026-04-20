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
}

export const useProviderModelStore = create<ProviderModelState>((set) => ({
  catalogs: createInitialProviderModelCatalogs(),
  selected: {
    codex: "",
    claude: "",
    qwen: "",
    opencode: "",
  },
  setCatalog: (provider, catalog) => {
    set((state) => ({
      catalogs: { ...state.catalogs, [provider]: catalog },
      selected: {
        ...state.selected,
        [provider]: getSelectedModelValue(state.selected[provider], catalog),
      },
    }));
  },
  setSelectedModel: (provider, value) => {
    set((state) => ({
      selected: { ...state.selected, [provider]: value },
    }));
  },
}));
