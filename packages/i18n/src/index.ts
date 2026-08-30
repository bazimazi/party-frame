/**
 * Minimal localisation layer.
 *
 * Deliberately dependency-free: the platform only needs key lookup, `{param}`
 * interpolation and a fallback chain. Swapping in a full i18n library later only
 * touches this file, because everything else speaks in translation keys.
 */

import { en, type Dictionary, type TranslationKey } from "./en.js";

export type { TranslationKey, Dictionary };
export { en };

/** A locale that is not fully translated may omit keys; English fills the gaps. */
export type PartialDictionary = Partial<Dictionary>;

export interface LocaleDefinition {
  code: string;
  /** Endonym, shown in a language picker. */
  label: string;
  /** Text direction. Set to "rtl" for Persian, Arabic, Hebrew. */
  dir: "ltr" | "rtl";
  messages: PartialDictionary;
}

const locales = new Map<string, LocaleDefinition>();

export function registerLocale(locale: LocaleDefinition): void {
  locales.set(locale.code, locale);
}

registerLocale({ code: "en", label: "English", dir: "ltr", messages: en });

/** Merges extra keys (typically a game dictionary) into an already-registered locale. */
export function addMessages(localeCode: string, extra: Record<string, string>): void {
  const locale = locales.get(localeCode);
  if (!locale) return;
  locale.messages = { ...locale.messages, ...extra };
}

export function listLocales(): LocaleDefinition[] {
  return [...locales.values()];
}

export function getLocale(code: string): LocaleDefinition | undefined {
  return locales.get(code);
}

export type TranslateParams = Record<string, string | number>;

/** Replaces every `{name}` placeholder present in `params`. */
function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

/**
 * A bound translate function.
 *
 * Unknown keys return the key itself rather than throwing or rendering blank, so
 * a missing translation is visible in review but never breaks a live game.
 */
export type Translate = (key: TranslationKey | string, params?: TranslateParams) => string;

export function createTranslator(localeCode: string): {
  t: Translate;
  dir: "ltr" | "rtl";
  code: string;
} {
  const locale = locales.get(localeCode) ?? locales.get("en")!;
  const t: Translate = (key, params) => {
    const template =
      (locale.messages as Record<string, string | undefined>)[key] ??
      (en as Record<string, string | undefined>)[key] ??
      key;
    return interpolate(template, params);
  };
  return { t, dir: locale.dir, code: locale.code };
}

/** Picks the best supported locale for a browser's `navigator.languages`. */
export function resolveLocale(preferred: readonly string[]): string {
  for (const tag of preferred) {
    const exact = tag.toLowerCase();
    if (locales.has(exact)) return exact;
    const base = exact.split("-")[0];
    if (base && locales.has(base)) return base;
  }
  return "en";
}
