import { createContext, useContext } from "react";

export const TempSizeContext = createContext<"small" | "large">("large");

export function useTempSize() {
    return useContext(TempSizeContext);
}
