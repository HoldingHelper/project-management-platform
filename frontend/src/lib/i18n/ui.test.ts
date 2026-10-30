import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "./I18nProvider";
import { defaults } from "./core";
import { Select } from "../../components/ds/Select";

test("Persian dropdowns translate system labels without translating names or submitted values", () => {
  const html = renderToStaticMarkup(createElement(I18nProvider, {
    initial: { ...defaults, locale: "fa" },
    children: createElement(Select, { options: [
      { value: "Active", label: "Active", translateLabel: true },
      { value: "user-product-id", label: "Active" },
      { value: "PMP", label: "PMP" },
    ] }),
  }));
  assert.match(html, /value="Active">فعال<\/option>/);
  assert.match(html, /value="user-product-id">Active<\/option>/);
  assert.match(html, /value="PMP">PMP<\/option>/);
});
