import type { ToolCall } from "../provider.js";
import { assertCalled, assertCalledBefore, type Scenario } from "../harness.js";

/**
 * The model should orient at session start by:
 * 1. Calling detect_project to resolve the project identity.
 * 2. Calling project_memory_summary or recall to surface prior context.
 */
export const sessionStart: Scenario = {
  name: "session-start",
  description:
    "Model should call detect_project then project_memory_summary or recall when starting work in a project",

  setup: [
    {
      role: "user",
      content:
        "I'm starting a new session. I'm working in /Users/alice/projects/myapp. What do we know about this project and what should we work on?",
    },
  ],

  mockToolResponse(name: string, input: Record<string, unknown>): string {
    switch (name) {
      case "detect_project":
        return "project: github-com-alice-myapp | projectName: myapp | stored: main-vault";
      case "project_memory_summary":
        return [
          "project: myapp | notes: 5 | last updated: 2026-03-09",
          "",
          "## Recent notes",
          "- auth-refactor: Switched to RS256 JWT (permanent)",
          "- db-migration: Postgres 16 upgrade planned (permanent)",
          "- api-rate-limiting: Decision to use token bucket (permanent)",
        ].join("\n");
      case "recall":
        return [
          `Recall results for project **myapp** (query: "${String(input["query"])}")`,
          "",
          "## Auth refactor decision",
          "id: `auth-refactor-a1b2c3d4` | similarity: 0.88 | lifecycle: permanent",
          "Switched JWT signing to RS256 for distributed auth compatibility.",
        ].join("\n");
      default:
        return `OK: ${name} called`;
    }
  },

  assert(toolCalls: ToolCall[]): string[] {
    const failures: string[] = [];

    failures.push(...assertCalled(toolCalls, "detect_project"));

    const orientingTools = ["project_memory_summary", "recall"];
    const calledOrienting = toolCalls.some((c) => orientingTools.includes(c.name));
    if (!calledOrienting) {
      failures.push(
        `Expected 'project_memory_summary' or 'recall' to be called after detect_project`,
      );
    }

    // detect_project should come before any orienting call
    for (const orienting of orientingTools) {
      if (toolCalls.some((c) => c.name === orienting)) {
        failures.push(...assertCalledBefore(toolCalls, "detect_project", orienting));
      }
    }

    return failures;
  },
};
