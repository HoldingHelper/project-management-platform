import assert from "node:assert/strict";
import test from "node:test";
import { API_BASE_URL, resolveApiResourceUrl } from "./api/client";

test("resolves backend resource paths against the configured API origin", () => {
  assert.equal(
    resolveApiResourceUrl("/api/v1/music/tracks/file/stream?token=x"),
    `${API_BASE_URL}/music/tracks/file/stream?token=x`,
  );
  assert.equal(resolveApiResourceUrl("https://files.example/audio.mp3"), "https://files.example/audio.mp3");
});
