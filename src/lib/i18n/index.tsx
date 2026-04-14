import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { en } from "./en";
import { es } from "./es";

export type Locale = "en" | "es";

const dictionaries: Record<Locale, Record<string, string>> = { en, es };

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: "en",
  setLocale: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === "undefined") return "en";
    return (localStorage.getItem("taxeasy-locale") as Locale) ?? "en";
  });

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem("taxeasy-locale", l);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string>): string => {
      let val = dictionaries[locale][key] ?? dictionaries.en[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          val = val.replace(`{${k}}`, v);
        }
      }
      return val;
    },
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
