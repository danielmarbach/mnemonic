import { describe, expect, it } from "vitest";
import { ATTACHMENT_BOOST, PROJECT_SCOPE_BOOST } from "../src/tools/recall-helpers.js";

describe("Attachment boost constants", () => {
  it("ATTACHMENT_BOOST is half of PROJECT_SCOPE_BOOST", () => {
    expect(ATTACHMENT_BOOST).toBe(PROJECT_SCOPE_BOOST / 2);
    expect(ATTACHMENT_BOOST).toBe(0.015);
  });
});

describe.skip("recall attachment integration", () => {
  it("attached vault notes receive ATTACHMENT_BOOST scoring, between project-local and global", async () => {
  });

  it("scope project includes attached vault notes even when note.project differs", async () => {
  });

  it("scope global excludes attached vault notes", async () => {
  });
});