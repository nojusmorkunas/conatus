import { describe, expect, it } from "vitest";

import { keyName } from "./keyboard";

describe("keyName", () => {
  it("spells out Shift on letters and ignores Caps Lock", () => {
    expect(keyName({ key: "t", shiftKey: false })).toBe("t");
    expect(keyName({ key: "T", shiftKey: false })).toBe("t");
    expect(keyName({ key: "T", shiftKey: true })).toBe("Shift+t");
    expect(keyName({ key: "v", shiftKey: true })).toBe("Shift+v");
  });

  it("leaves symbols and named keys alone", () => {
    expect(keyName({ key: "?", shiftKey: true })).toBe("?");
    expect(keyName({ key: "Enter", shiftKey: true })).toBe("Enter");
    expect(keyName({ key: "1", shiftKey: false })).toBe("1");
  });
});
