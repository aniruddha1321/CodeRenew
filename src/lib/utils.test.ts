import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("cn", () => {
  it("merges tailwind classes with conflict resolution", () => {
    const result = cn("px-2 py-1", "px-4", "text-sm");
    expect(result).toContain("px-4");
    expect(result).not.toContain("px-2");
    expect(result).toContain("py-1");
    expect(result).toContain("text-sm");
  });

  it("ignores falsey class inputs", () => {
    const result = cn("font-bold", undefined, false && "hidden", null);
    expect(result).toBe("font-bold");
  });
});
