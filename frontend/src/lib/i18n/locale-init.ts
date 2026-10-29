import type { Locale } from "./core";

/** Hide mismatched static HTML until React restores the validated locale cookie. */
export function localeInitScript(serverLocale: Locale): string {
  return `(()=>{try{const match=document.cookie.match(/(?:^|;\\s*)pmp\\.locale=(en|fa)(?:;|$)/);const locale=match?.[1];if(locale&&locale!==${JSON.stringify(serverLocale)}){document.documentElement.lang=locale;document.documentElement.dir=locale==='fa'?'rtl':'ltr';document.documentElement.dataset.localePending='true';}}catch{}})();`;
}
