import { describe, expect, it } from "vitest";

import { splitLinks } from "./links";

describe("splitLinks", () => {
  it("puts each URL at an odd index", () => {
    expect(splitLinks("Read https://example.com/a?b=1#c now")).toEqual(["Read ", "https://example.com/a?b=1#c", " now"]);
    expect(splitLinks("http://a.io and https://b.io")).toEqual(["", "http://a.io", " and ", "https://b.io", ""]);
  });

  it("leaves trailing punctuation and wrapping brackets out", () => {
    expect(splitLinks("See https://example.com.")).toEqual(["See ", "https://example.com", "."]);
    expect(splitLinks("(https://example.com/x)")).toEqual(["(", "https://example.com/x", ")"]);
  });

  it("ignores text that is not an http link", () => {
    expect(splitLinks("no links here")).toEqual(["no links here"]);
    expect(splitLinks("javascript:alert(1)")).toEqual(["javascript:alert(1)"]);
    expect(splitLinks("http://")).toEqual(["http://"]);
  });
});
