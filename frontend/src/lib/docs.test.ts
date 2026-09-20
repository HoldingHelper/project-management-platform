import test from "node:test";
import assert from "node:assert/strict";
import { DOC_CATEGORIES, TUTORIALS } from "./docs/content";

test("DOC_CATEGORIES contains structured categories with valid docs", () => {
  assert.ok(DOC_CATEGORIES.length > 0);
  for (const cat of DOC_CATEGORIES) {
    assert.ok(cat.slug, "Category must have a slug");
    assert.ok(cat.label, "Category must have a label");
    assert.ok(Array.isArray(cat.docs), "Category must contain docs array");
    for (const doc of cat.docs) {
      assert.ok(doc.slug, "Doc must have a slug");
      assert.ok(doc.title, "Doc must have a title");
      assert.equal(doc.category, cat.slug, "Doc category must match parent slug");
    }
  }
});

test("TUTORIALS contains verified video guide entries", () => {
  assert.ok(TUTORIALS.length > 0);
  for (const tut of TUTORIALS) {
    assert.ok(tut.title, "Tutorial must have a title");
    assert.ok(tut.category, "Tutorial must have a category");
    assert.ok(tut.href, "Tutorial must have an href");
    assert.ok(tut.videoId, "Tutorial must have a videoId");
  }
});

test("TUTORIALS categories match expected public filters", () => {
  const categories = Array.from(new Set(TUTORIALS.map((t) => t.category)));
  assert.ok(categories.includes("Projects"));
  assert.ok(categories.includes("Tasks"));
  assert.ok(categories.includes("Getting started"));
});
