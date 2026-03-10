import type { ToolCall } from "../provider.js";
import { assertCalled, assertInput, type Scenario } from "../harness.js";

/**
 * The model should choose lifecycle: "permanent" for durable knowledge and
 * lifecycle: "temporary" for working-state notes like plans and WIP.
 */

export const lifecyclePermanent: Scenario = {
  name: "lifecycle-permanent",
  description:
    "Model should use lifecycle: permanent when storing a resolved decision or fix",

  setup: [
    {
      role: "user",
      content:
        "We fixed the JWT expiry bug. The root cause was that we were comparing UTC timestamps against local time. The fix was to normalise everything to UTC before comparison. Store this for the myapp project at /Users/alice/projects/myapp.",
    },
  ],

  mockToolResponse(name: string, input: Record<string, unknown>): string {
    switch (name) {
      case "detect_project":
        return "project: github-com-alice-myapp | projectName: myapp";
      case "recall":
        return `Recall results for project **myapp** (query: "${String(input["query"])}")\n\nNo closely matching notes found.`;
      case "remember":
        return [
          "Remembered as `jwt-expiry-fix-utc-a1b2c3d4`",
          "[project 'myapp', stored=project]",
          "Persistence: embedding written | git committed",
        ].join("\n");
      default:
        return `OK: ${name} called`;
    }
  },

  assert(toolCalls: ToolCall[]): string[] {
    const failures: string[] = [];

    failures.push(...assertCalled(toolCalls, "remember"));
    failures.push(
      ...assertInput(
        toolCalls,
        "remember",
        (input) => input["lifecycle"] === "permanent" || input["lifecycle"] === undefined,
        "lifecycle should be 'permanent' (or omitted, which defaults to permanent)",
      ),
    );

    // Should NOT be temporary
    failures.push(
      ...assertInput(
        toolCalls,
        "remember",
        (input) => input["lifecycle"] !== "temporary",
        "lifecycle must not be 'temporary' for a resolved bug fix",
      ),
    );

    return failures;
  },
};

export const lifecycleTemporary: Scenario = {
  name: "lifecycle-temporary",
  description:
    "Model should use lifecycle: temporary when storing a WIP plan or unvalidated idea",

  setup: [
    {
      role: "user",
      content:
        "I'm thinking we might refactor the auth module next sprint to support OAuth2. It's just a rough plan for now, not decided yet. Save it for the myapp project at /Users/alice/projects/myapp.",
    },
  ],

  mockToolResponse(name: string, input: Record<string, unknown>): string {
    switch (name) {
      case "detect_project":
        return "project: github-com-alice-myapp | projectName: myapp";
      case "recall":
        return `Recall results for project **myapp** (query: "${String(input["query"])}")\n\nNo closely matching notes found.`;
      case "remember":
        return [
          "Remembered as `oauth2-refactor-plan-b5c6d7e8`",
          "[project 'myapp', stored=project]",
          "Persistence: embedding written | git committed",
        ].join("\n");
      default:
        return `OK: ${name} called`;
    }
  },

  assert(toolCalls: ToolCall[]): string[] {
    const failures: string[] = [];

    failures.push(...assertCalled(toolCalls, "remember"));
    failures.push(
      ...assertInput(
        toolCalls,
        "remember",
        (input) => input["lifecycle"] === "temporary",
        "lifecycle should be 'temporary' for an unvalidated rough plan",
      ),
    );

    return failures;
  },
};
