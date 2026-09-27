import type { McpServer } from "@modelcontextprotocol/server";
import type { ServerContext } from "../server-context.js";
import { CORE_TOOLS, isToolEnabled, type Toolset } from "../toolset.js";

import { registerDetectProjectTool } from "./detect-project.js";
import { registerGetProjectIdentityTool } from "./get-project-identity.js";
import { registerSetProjectIdentityTool } from "./set-project-identity.js";
import { registerListMigrationsTool, registerExecuteMigrationTool } from "./migration.js";
import {
  registerSetProjectMemoryPolicyTool,
  registerGetProjectMemoryPolicyTool,
} from "./policy.js";
import { registerRememberTool } from "./remember.js";
import { registerRecallTool } from "./recall.js";
import { registerUpdateTool } from "./update.js";
import { registerForgetTool } from "./forget.js";
import { registerGetTool } from "./get.js";
import { registerWhereIsMemoryTool } from "./where-is-memory.js";
import { registerListTool } from "./list.js";
import { registerDiscoverTagsTool } from "./discover-tags.js";
import { registerRecentMemoriesTool } from "./recent-memories.js";
import { registerMemoryGraphTool } from "./memory-graph.js";
import { registerProjectMemorySummaryTool } from "./project-memory-summary.js";
import { registerSyncTool } from "./sync.js";
import { registerMoveMemoryTool } from "./move-memory.js";
import { registerRelateTool } from "./relate.js";
import { registerUnrelateTool } from "./unrelate.js";
import { registerConsolidateTool } from "./consolidate.js";
import { registerAddAttachmentTool } from "./add-attachment.js";
import { registerRemoveAttachmentTool } from "./remove-attachment.js";
import { registerListAttachmentsTool } from "./list-attachments.js";
import { registerSetAttachmentEnabledTool } from "./set-attachment-enabled.js";
import { registerSetAttachmentBranchTool } from "./set-attachment-branch.js";

type ToolRegistration = readonly [
  name: string,
  register: (server: McpServer, ctx: ServerContext) => void,
];

// Registration order is the tools/list order clients see.
const TOOL_REGISTRATIONS = [
  ["detect_project", registerDetectProjectTool],
  ["get_project_identity", registerGetProjectIdentityTool],
  ["set_project_identity", registerSetProjectIdentityTool],
  ["list_migrations", registerListMigrationsTool],
  ["execute_migration", registerExecuteMigrationTool],
  ["set_project_memory_policy", registerSetProjectMemoryPolicyTool],
  ["get_project_memory_policy", registerGetProjectMemoryPolicyTool],
  ["remember", registerRememberTool],
  ["recall", registerRecallTool],
  ["update", registerUpdateTool],
  ["forget", registerForgetTool],
  ["get", registerGetTool],
  ["where_is_memory", registerWhereIsMemoryTool],
  ["list", registerListTool],
  ["discover_tags", registerDiscoverTagsTool],
  ["recent_memories", registerRecentMemoriesTool],
  ["memory_graph", registerMemoryGraphTool],
  ["project_memory_summary", registerProjectMemorySummaryTool],
  ["sync", registerSyncTool],
  ["move_memory", registerMoveMemoryTool],
  ["relate", registerRelateTool],
  ["unrelate", registerUnrelateTool],
  ["consolidate", registerConsolidateTool],
  ["add_attachment", registerAddAttachmentTool],
  ["remove_attachment", registerRemoveAttachmentTool],
  ["list_attachments", registerListAttachmentsTool],
  ["set_attachment_enabled", registerSetAttachmentEnabledTool],
  ["set_attachment_branch", registerSetAttachmentBranchTool],
] as const satisfies readonly ToolRegistration[];

type RegisteredToolName = (typeof TOOL_REGISTRATIONS)[number][0];

export const REGISTERED_TOOL_NAMES: readonly RegisteredToolName[] = TOOL_REGISTRATIONS.map(
  ([name]) => name,
);

// Fails to compile if a core tool name is not in the registry.
const coreToolsAreRegistered: readonly RegisteredToolName[] = CORE_TOOLS;
void coreToolsAreRegistered;

export function registerAllTools(
  server: McpServer,
  ctx: ServerContext,
  toolset: Toolset = "full",
): void {
  for (const [name, register] of TOOL_REGISTRATIONS) {
    if (isToolEnabled(toolset, name)) {
      register(server, ctx);
    }
  }
}
