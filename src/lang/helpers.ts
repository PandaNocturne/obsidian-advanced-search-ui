import en from "./locale/en";
import zh from "./locale/zh";

type AppLocaleConfig = {
  locale?: string;
  lang?: string;
  language?: string;
};

type AppWithLocale = {
  locale?: string;
  lang?: string;
  language?: string;
  appId?: string;
  vault?: {
    getConfig?: (key: string) => unknown;
    config?: AppLocaleConfig;
  };
  loadLocalStorage?: (key: string) => unknown;
};

function normalizeLocale(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function getCurrentLocale(): string {
  const globalApp = (globalThis as { app?: AppWithLocale }).app;
  const configCandidates = [
    globalApp?.vault?.getConfig?.("locale"),
    globalApp?.vault?.getConfig?.("lang"),
    globalApp?.vault?.config?.locale,
    globalApp?.vault?.config?.lang,
    globalApp?.vault?.config?.language,
    globalApp?.locale,
    globalApp?.lang,
    globalApp?.language,
    globalApp?.loadLocalStorage?.("language"),
    globalApp?.loadLocalStorage?.("locale"),
    globalThis.localStorage?.getItem("language"),
    globalThis.localStorage?.getItem("locale"),
    globalThis.navigator?.language,
  ];

  for (const candidate of configCandidates) {
    const locale = normalizeLocale(candidate);
    if (locale) {
      return locale;
    }
  }

  return "en";
}

function getLocaleMap() {
  const lang = getCurrentLocale();
  return lang.startsWith("zh") ? zh : en;
}

export function t(key: keyof typeof en): string {
  const locale = getLocaleMap();
  return locale[key] || en[key] || key;
}
