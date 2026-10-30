import { test } from "node:test";
import assert from "node:assert/strict";
import { copyText } from "./clipboard";

test("copy uses Clipboard API when available", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  let copied = "";
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText: async (value: string) => { copied = value; } } } });
  try { await copyText("multiline\nconfiguration"); assert.equal(copied, "multiline\nconfiguration"); }
  finally { if (original) Object.defineProperty(globalThis, "navigator", original); else Reflect.deleteProperty(globalThis, "navigator"); }
});

for (const mode of ["http", "denied", "unavailable"] as const) {
  test(`copy fallback handles ${mode} and cleans up temporary text`, async () => {
    const originals = new Map(["navigator", "document", "HTMLElement"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    let removed = false, restored = false, copied = "";
    class Element { focus() { restored = true; } }
    const input = { value: "", readOnly: false, style: { cssText: "" }, focus() {}, select() {}, setSelectionRange() {}, remove() { removed = true; } };
    Object.defineProperty(globalThis, "HTMLElement", { configurable: true, value: Element });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: mode === "http" ? {} : { clipboard: { writeText: async () => { throw new Error("Denied"); } } } });
    Object.defineProperty(globalThis, "document", { configurable: true, value: {
      activeElement: new Element(), getSelection: () => null, createElement: () => input,
      body: { appendChild() {} }, execCommand: (command: string) => { assert.equal(command, "copy"); copied = input.value; return mode !== "unavailable"; },
    } });
    try {
      if (mode === "unavailable") await assert.rejects(copyText("configuration"));
      else await copyText("configuration");
      assert.equal(copied, "configuration"); assert.equal(input.value, ""); assert.ok(removed); assert.ok(restored);
    } finally {
      for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    }
  });
}
