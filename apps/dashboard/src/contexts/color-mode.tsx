import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";

export type ColorMode = "light" | "dark";

type ColorModeContextValue = {
  mode: ColorMode;
  setMode: (mode: ColorMode) => void;
  toggle: () => void;
};

const STORAGE_KEY = "dashboard:color-mode";

const ColorModeContext = createContext<ColorModeContextValue | null>(null);

export const ColorModeProvider = ({ children }: PropsWithChildren) => {
  const [mode, setMode] = useState<ColorMode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const value = useMemo<ColorModeContextValue>(
    () => ({
      mode,
      setMode,
      toggle: () => setMode((prev) => (prev === "dark" ? "light" : "dark")),
    }),
    [mode],
  );

  return (
    <ColorModeContext.Provider value={value}>
      {children}
    </ColorModeContext.Provider>
  );
};

export const useColorMode = () => {
  const ctx = useContext(ColorModeContext);
  if (!ctx) throw new Error("useColorMode must be used within ColorModeProvider");
  return ctx;
};
