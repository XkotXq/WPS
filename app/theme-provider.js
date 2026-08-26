"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useServerInsertedHTML } from "next/navigation";
import { THEME_STORAGE_KEY } from "@/lib/theme";

const ThemeContext = createContext(null);

const noFlashScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)})||"system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var c=document.documentElement.classList;d?c.add("dark"):c.remove("dark");document.documentElement.style.colorScheme=d?"dark":"light";}catch(e){}})();`;

function resolveTheme(theme) {
  if (theme === "system" || !theme) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

function applyTheme(theme) {
  const resolved = resolveTheme(theme);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
}

export function ThemeProvider({ children }) {
  useServerInsertedHTML(() => (
    <script id="no-flash-theme" dangerouslySetInnerHTML={{ __html: noFlashScript }} />
  ));

  const [theme, setThemeState] = useState(null);

  useEffect(() => {
    setThemeState(window.localStorage.getItem(THEME_STORAGE_KEY) || "system");
  }, []);

  useEffect(() => {
    if (!theme) return;
    applyTheme(theme);
    if (theme !== "system") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => applyTheme("system");
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [theme]);

  function setTheme(next) {
    setThemeState(next);
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  }

  return (
    <ThemeContext.Provider value={{ theme: theme ?? "system", setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
