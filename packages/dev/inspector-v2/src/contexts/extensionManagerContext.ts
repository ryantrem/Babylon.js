import type { ExtensionManager } from "../extensibility/extensionManager";

import { createContext, useContext } from "react";

export const ExtensionManagerContext = createContext<ExtensionManager | undefined>(undefined);

export function useExtensionManager() {
    return useContext(ExtensionManagerContext);
}
