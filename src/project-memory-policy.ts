import fs from "fs/promises";
import path from "path";

export type WriteScope = "project" | "global";
export const WRITE_SCOPES = ["project", "global"] as const satisfies readonly WriteScope[];
export type ProjectPolicyScope = WriteScope | "ask";
export const PROJECT_POLICY_SCOPES = ["project", "global", "ask"] as const satisfies readonly ProjectPolicyScope[];

export interface ProjectMemoryPolicy {
  projectId: string;
  projectName?: string;
  defaultScope: ProjectPolicyScope;
  updatedAt: string;
}

type PolicyFile = {
  projects: Record<string, ProjectMemoryPolicy>;
};

const emptyPolicyFile = (): PolicyFile => ({ projects: {} });

export class ProjectMemoryPolicyStore {
  readonly filePath: string;

  constructor(mainVaultPath: string) {
    this.filePath = path.join(path.resolve(mainVaultPath), "project-memory-policies.json");
  }

  async get(projectId: string): Promise<ProjectMemoryPolicy | undefined> {
    const data = await this.readAll();
    return data.projects[projectId];
  }

  async set(policy: ProjectMemoryPolicy): Promise<void> {
    const data = await this.readAll();
    data.projects[policy.projectId] = policy;
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
  }

  private async readAll(): Promise<PolicyFile> {
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as Partial<PolicyFile>;
      return {
        projects: parsed.projects ?? {},
      };
    } catch {
      return emptyPolicyFile();
    }
  }
}

export function resolveWriteScope(
  explicitScope: WriteScope | undefined,
  projectPolicyScope: ProjectPolicyScope | undefined,
  hasProjectContext: boolean,
): WriteScope | "ask" {
  if (explicitScope) {
    return explicitScope;
  }

  if (projectPolicyScope) {
    return projectPolicyScope;
  }

  return hasProjectContext ? "project" : "global";
}
