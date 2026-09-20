import test from "node:test";
import assert from "node:assert/strict";

function extractMentionUsernames(text: string): string[] {
  const matches = text.match(/@([a-zA-Z0-9_-]+)/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(1)))];
}

test("extractMentionUsernames parses unique @handles from text", () => {
  const text = "Hey @alice and @bob please review task with @alice again";
  const mentions = extractMentionUsernames(text);
  assert.deepEqual(mentions, ["alice", "bob"]);
});

test("extractMentionUsernames returns empty array when no mentions exist", () => {
  const text = "No mentions in this text string.";
  const mentions = extractMentionUsernames(text);
  assert.deepEqual(mentions, []);
});

test("extractMentionUsernames handles hyphenated and underscored handles", () => {
  const text = "Ping @staff_lead and @john-doe on this blocker";
  const mentions = extractMentionUsernames(text);
  assert.deepEqual(mentions, ["staff_lead", "john-doe"]);
});
