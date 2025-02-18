import OptionsService from "@core/services/OptionsService";

import localeDe from "./de.json";
import localeDeInformal from "./de@informal.json";
import localeEn from "./en.json";
import localeRu from "./ru.json";

const locales = {
  de: localeDe,
  "de@informal": localeDeInformal,
  en: localeEn,
  nl: localeEn, // CNR only
  ru: localeRu
} as const;

export type Locale = keyof typeof locales;

export function isLocale(s: string): s is Locale {
  return s in locales;
}

export default function currentLocale() {
  return locales[OptionsService.getText("locale") as Locale];
}
