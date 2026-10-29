import { test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { localeInitScript } from "./locale-init";

test("static English HTML waits for the selected Persian locale before becoming visible", () => {
  const html = { lang: "en", dir: "ltr", dataset: {} as Record<string, string> };
  runInNewContext(localeInitScript("en"), { document: { cookie: "theme=light; pmp.locale=fa; other=1", documentElement: html } });
  assert.equal(html.lang, "fa");
  assert.equal(html.dir, "rtl");
  assert.equal(html.dataset.localePending, "true");
});

test("matching SSR preferences remain visible without a locale restoration gate", () => {
  const html = { lang: "fa", dir: "rtl", dataset: {} as Record<string, string> };
  runInNewContext(localeInitScript("fa"), { document: { cookie: "pmp.locale=fa", documentElement: html } });
  assert.equal(html.dataset.localePending, undefined);
});

test("invalid cookies and blocked cookie access do not hide the app", () => {
  const html = { lang: "en", dir: "ltr", dataset: {} as Record<string, string> };
  runInNewContext(localeInitScript("en"), { document: { cookie: "pmp.locale=farsi", documentElement: html } });
  const blocked = { documentElement: html, get cookie(): string { throw new Error("Cookie access blocked"); } };
  assert.doesNotThrow(() => runInNewContext(localeInitScript("en"), { document: blocked }));
  assert.equal(html.lang, "en");
  assert.equal(html.dataset.localePending, undefined);
});
