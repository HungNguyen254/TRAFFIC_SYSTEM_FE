import assert from "node:assert/strict";
import test from "node:test";

import { getResponsiveFabPosition } from "../src/js/components/chatbot.js";

test("mobile chatbot position ignores saved desktop coordinates", () => {
  const position = getResponsiveFabPosition({
    desktopPosition: { left: 720, top: 24 },
    mobilePosition: null,
    isMobile: true,
    viewportWidth: 390,
    viewportHeight: 844,
    width: 52,
    height: 52,
  });

  assert.deepEqual(position, { left: 314, top: 768 });
});

test("saved chatbot positions are clamped to the current viewport", () => {
  const position = getResponsiveFabPosition({
    desktopPosition: null,
    mobilePosition: { left: 720, top: 900 },
    isMobile: true,
    viewportWidth: 390,
    viewportHeight: 844,
    width: 52,
    height: 52,
  });

  assert.deepEqual(position, { left: 326, top: 780 });
});
