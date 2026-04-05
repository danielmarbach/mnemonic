import { describe, expect, it } from "vitest";

import { suggestAutoRelationships } from "../src/auto-relate.js";
import type { Note } from "../src/storage.js";

function makeNote(overrides: Partial<Note> & Pick<Note, "id" | "title" | "content">): Note {
  return {
    id: overrides.id,
    title: overrides.title,
    content: overrides.content,
    tags: overrides.tags ?? [],
    lifecycle: overrides.lifecycle ?? "permanent",
    project: overrides.project ?? "project-1",
    projectName: overrides.projectName ?? "Test Project",
    relatedTo: overrides.relatedTo,
    createdAt: overrides.createdAt ?? "2026-04-05T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-04-05T00:00:00.000Z",
    memoryVersion: 1,
  };
}

describe("suggestAutoRelationships", () => {
  it("links to recently inspected permanent notes explicitly mentioned by title", () => {
    const source = makeNote({
      id: "result",
      title: "Investigation results",
      content: "Follow-up on Architecture anchor. The result confirms the prior design.",
      tags: ["investigation"],
    });

    const candidate = makeNote({
      id: "architecture",
      title: "Architecture anchor",
      content: "Stable architecture guidance.",
      tags: ["architecture"],
    });

    const relationships = suggestAutoRelationships(source, [
      { note: candidate, accessedAt: "2026-04-05T00:01:00.000Z", accessKind: "get", score: 0.7 },
    ]);

    expect(relationships).toEqual([{ id: "architecture", type: "related-to" }]);
  });

  it("does not link temporary or cross-project notes", () => {
    const source = makeNote({
      id: "result",
      title: "Investigation results",
      content: "Follow-up on Architecture anchor.",
    });

    const temporary = makeNote({
      id: "temp",
      title: "Architecture anchor",
      content: "temporary",
      lifecycle: "temporary",
    });

    const otherProject = makeNote({
      id: "other",
      title: "Architecture anchor",
      content: "other project",
      project: "project-2",
    });

    expect(suggestAutoRelationships(source, [
      { note: temporary, accessedAt: "2026-04-05T00:01:00.000Z", accessKind: "get" },
      { note: otherProject, accessedAt: "2026-04-05T00:02:00.000Z", accessKind: "get" },
    ])).toEqual([]);
  });
});
