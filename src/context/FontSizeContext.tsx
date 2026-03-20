"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type FontSize = "small" | "medium" | "large";

type FontSizeContextType = {
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
};

const STORAGE_KEY = "crm_font_size";

const FontSizeContext = createContext<FontSizeContextType | null>(null);

export function FontSizeProvider({ children }: { children: ReactNode }) {
  const [fontSize, setFontSizeState] = useState<FontSize>(() => {
    if (typeof window === "undefined") return "medium";
    return (localStorage.getItem(STORAGE_KEY) as FontSize) || "medium";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, fontSize);
    document.documentElement.setAttribute("data-font-size", fontSize);
  }, [fontSize]);

  function setFontSize(size: FontSize) {
    setFontSizeState(size);
  }

  return (
    <FontSizeContext.Provider value={{ fontSize, setFontSize }}>
      {children}
    </FontSizeContext.Provider>
  );
}

export function useFontSize() {
  const ctx = useContext(FontSizeContext);
  if (!ctx) throw new Error("useFontSize must be used inside FontSizeProvider");
  return ctx;
}
