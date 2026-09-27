import { describe, expect, it, vi } from "vitest";

import { buildServerInstructions } from "../src/server-instructions.js";
import { CORE_TOOLS, isToolEnabled, resolveToolset } from "../src/toolset.js";

const BACKTICKED = /`([a-z_]+)`/g;

describe("resolveToolset", () => {
  it("defaults to full", () => {
    expect(resolveToolset(undefined)).toBe("full");
    expect(resolveToolset("  ")).toBe("full");
  });

  it("accepts known values case-insensitively", () => {
    expect(resolveToolset("core")).toBe("core");
    expect(resolveToolset(" CORE ")).toBe("core");
    expect(resolveToolset("full")).toBe("full");
  });

  it("falls back to full with a warning for unknown values", () => {
    const warn = vi.fn();
    expect(resolveToolset("minimal", warn)).toBe("full");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Unknown MNEMONIC_TOOLSET "minimal"'),
    );
  });
});

describe("isToolEnabled", () => {
  it("enables every tool in full and only core tools in core", () => {
    expect(isToolEnabled("full", "set_attachment_branch")).toBe(true);
    expect(isToolEnabled("core", "set_attachment_branch")).toBe(false);
    for (const tool of CORE_TOOLS) {
      expect(isToolEnabled("core", tool)).toBe(true);
    }
  });
});

describe("buildServerInstructions", () => {
  it("only names core tools in the shared guidance", () => {
    const named = [...buildServerInstructions("full").matchAll(BACKTICKED)].map((m) => m[1]);
    const toolNames = named.filter((name) => name !== "cwd");

    expect(toolNames.length).toBeGreaterThan(0);
    expect(toolNames.filter((name) => !(CORE_TOOLS as readonly string[]).includes(name!))).toEqual(
      [],
    );
  });

  it("tells core-mode clients which tools need the full toolset", () => {
    expect(buildServerInstructions("core")).toContain("MNEMONIC_TOOLSET=full");
    expect(buildServerInstructions("full")).not.toContain("MNEMONIC_TOOLSET");
  });

  it("stays short enough to live in every session's context", () => {
    expect(buildServerInstructions("full").length).toBeLessThan(800);
    expect(buildServerInstructions("core").length).toBeLessThan(1000);
  });
});
