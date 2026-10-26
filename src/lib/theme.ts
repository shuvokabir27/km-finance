export type ThemeName = "green" | "dark" | "red" | "blue" | "orange";

const STORAGE_KEY = "app-theme";
const ALL: ThemeName[] = ["green", "dark", "red", "blue", "orange"];

export const THEME_OPTIONS: { value: ThemeName; label: string; swatch: string }[] = [
  { value: "green", label: "সবুজ", swatch: "oklch(0.55 0.16 155)" },
  { value: "dark", label: "ডার্ক", swatch: "oklch(0.20 0.02 160)" },
  { value: "red", label: "লাল", swatch: "oklch(0.58 0.22 25)" },
  { value: "blue", label: "নীল", swatch: "oklch(0.55 0.18 250)" },
  { value: "orange", label: "কমলা", swatch: "oklch(0.68 0.18 50)" },
];

export function getStoredTheme(): ThemeName {
  if (typeof window === "undefined") return "green";
  const v = window.localStorage.getItem(STORAGE_KEY) as ThemeName | null;
  return v && ALL.includes(v) ? v : "green";
}

export function applyTheme(theme: ThemeName) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  ALL.forEach((t) => root.classList.remove(`theme-${t}`));
  root.classList.add(`theme-${theme}`);
  root.classList.toggle("dark", theme === "dark");
}

export function setStoredTheme(theme: ThemeName) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, theme);
  }
  applyTheme(theme);
}
