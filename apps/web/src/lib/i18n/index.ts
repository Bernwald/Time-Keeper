import { de, type Dictionary } from "./dictionaries/de";
import { en } from "./dictionaries/en";

export type Locale = "de" | "en";
export type { Dictionary };

const dictionaries: Record<Locale, Dictionary> = { de, en };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] || dictionaries.de;
}
