import { moment } from "obsidian";
import en from "./locale/en";
import zh from "./locale/zh";

const lang = (moment.locale() || 'en').toLowerCase();
const locale = lang.startsWith('zh') ? zh : en;

/**
 * Gets a translated string for a given key.
 * @param key - The translation key.
 * @returns The translated string.
 */
export function t(key: keyof typeof en): string {
  return locale[key] || en[key] || key;
}
