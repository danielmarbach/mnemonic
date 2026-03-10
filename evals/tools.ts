import type { ToolDefinition } from "./provider.js";

export const TOOLS: ToolDefinition[] = [
  {
    name: "detect_project",
    description: "Resolve cwd to a stable project id via git remote URL.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string", description: "Working directory path" },
      },
      required: ["cwd"],
    },
  },
  {
    name: "project_memory_summary",
    description: "Summarize what mnemonic knows about a project.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string", description: "Working directory path" },
      },
      required: ["cwd"],
    },
  },
  {
    name: "recall",
    description:
      "Semantic search over memories. Pass cwd when in a project to boost project notes.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        cwd: { type: "string", description: "Working directory for project boost" },
        scope: {
          type: "string",
          enum: ["all", "project", "global"],
          description: "Limit results by scope",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "remember",
    description:
      "Write a note + embedding. cwd sets project context, scope picks storage, lifecycle picks temporary vs permanent.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        lifecycle: { type: "string", enum: ["permanent", "temporary"] },
        scope: { type: "string", enum: ["project", "global"] },
        cwd: { type: "string" },
        summary: { type: "string" },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "update",
    description: "Update an existing note's content, title, tags, or lifecycle.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        content: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        lifecycle: { type: "string", enum: ["permanent", "temporary"] },
        summary: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "relate",
    description: "Create a typed relationship between two notes.",
    inputSchema: {
      type: "object",
      properties: {
        fromId: { type: "string" },
        toId: { type: "string" },
        type: {
          type: "string",
          enum: ["related-to", "explains", "example-of", "supersedes"],
        },
        bidirectional: { type: "boolean" },
        cwd: { type: "string" },
      },
      required: ["fromId", "toId", "type"],
    },
  },
  {
    name: "consolidate",
    description: "Merge multiple notes into one.",
    inputSchema: {
      type: "object",
      properties: {
        strategy: {
          type: "string",
          enum: ["dry-run", "suggest-merges", "execute-merge", "prune-superseded"],
        },
        cwd: { type: "string" },
        mode: { type: "string", enum: ["supersedes", "delete"] },
        mergePlan: {
          type: "object",
          properties: {
            sourceIds: { type: "array", items: { type: "string" } },
            targetTitle: { type: "string" },
            content: { type: "string" },
            summary: { type: "string" },
          },
        },
      },
      required: ["strategy"],
    },
  },
];
