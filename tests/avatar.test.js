import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_AVATAR_BYTES,
  validateAvatarFile,
} from "../src/js/services/avatar.js";

test("avatar validation accepts supported image types within the size limit", () => {
  assert.equal(validateAvatarFile({ type: "image/png", size: MAX_AVATAR_BYTES }), "");
  assert.equal(validateAvatarFile({ type: "image/jpeg", size: 1024 }), "");
  assert.equal(validateAvatarFile({ type: "image/webp", size: 1024 }), "");
});

test("avatar validation rejects unsupported types and files over 2 MB", () => {
  assert.match(
    validateAvatarFile({ type: "image/svg+xml", size: 1024 }),
    /PNG, JPEG hoặc WebP/,
  );
  assert.match(
    validateAvatarFile({ type: "image/png", size: MAX_AVATAR_BYTES + 1 }),
    /2 MB/,
  );
});
