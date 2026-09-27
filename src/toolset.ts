export const TOOLSETS = ["full", "core"] as const;
export type Toolset = (typeof TOOLSETS)[number];

/** The everyday memory loop; `full` adds attachment, identity, migration and maintenance tools. */
export const CORE_TOOLS = [
  "recall",
  "get",
  "remember",
  "update",
  "relate",
  "list",
  "sync",
  "project_memory_summary",
  "consolidate",
] as const;
export type CoreToolName = (typeof CORE_TOOLS)[number];

function isToolset(value: string): value is Toolset {
  return (TOOLSETS as readonly string[]).includes(value);
}

/** Reads `MNEMONIC_TOOLSET`; unknown values fall back to `full` so no tool silently disappears. */
export function resolveToolset(
  value: string | undefined,
  warn: (message: string) => void = console.error,
): Toolset {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return "full";
  }
  if (isToolset(normalized)) {
    return normalized;
  }
  warn(
    `[mnemonic] Unknown MNEMONIC_TOOLSET "${value}"; expected one of ${TOOLSETS.join(", ")}. Using "full".`,
  );
  return "full";
}

export function isToolEnabled(toolset: Toolset, toolName: string): boolean {
  return toolset === "full" || (CORE_TOOLS as readonly string[]).includes(toolName);
}
