import type { ToolCall } from "../provider.js";
import { assertCalled, assertCalledBefore, type Scenario } from "../harness.js";

/**
 * Before writing a new memory the model should first call recall to check
 * whether a related note already exists. If one does, it should update rather
 * than creating a duplicate.
 */
export const recallBeforeRemember: Scenario = {
  name: "recall-before-remember",
  description:
    "Model should call recall before remember to avoid creating duplicate notes",

  setup: [
    {
      role: "user",
      content:
        "We just decided to use PostgreSQL 16 with connection pooling via PgBouncer for the myapp project at /Users/alice/projects/myapp. Please remember this decision.",
    },
  ],

  mockToolResponse(name: string, input: Record<string, unknown>): string {
    switch (name) {
      case "detect_project":
        return "project: github-com-alice-myapp | projectName: myapp";
      case "recall":
        return [
          `Recall results for project **myapp** (query: "${String(input["query"])}")`,
          "",
          "No closely matching notes found.",
        ].join("\n");
      case "remember":
        return [
          "Remembered as `db-decision-pg16-pgbouncer-f1e2d3c4`",
          "[project 'myapp', stored=project]",
          "Persistence: embedding written | git committed",
        ].join("\n");
      case "update":
        return "Updated memory `db-decision-pg16-pgbouncer-f1e2d3c4` | Persistence: embedding written | git committed";
      default:
        return `OK: ${name} called`;
    }
  },

  assert(toolCalls: ToolCall[]): string[] {
    const failures: string[] = [];

    // recall must be called
    failures.push(...assertCalled(toolCalls, "recall"));

    // remember or update must be called (one or the other is fine)
    const wroteMemory = toolCalls.some((c) => c.name === "remember" || c.name === "update");
    if (!wroteMemory) {
      failures.push("Expected 'remember' or 'update' to be called");
    }

    // recall must come before remember
    if (toolCalls.some((c) => c.name === "remember")) {
      failures.push(...assertCalledBefore(toolCalls, "recall", "remember"));
    }

    // recall must come before update too
    if (toolCalls.some((c) => c.name === "update")) {
      failures.push(...assertCalledBefore(toolCalls, "recall", "update"));
    }

    return failures;
  },
};
