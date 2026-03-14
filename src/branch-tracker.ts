import { getCurrentGitBranch } from "./project.js";

const branchHistory = new Map<string, string>();

export function getLastBranch(cwd: string): string | undefined {
  return branchHistory.get(cwd);
}

export function updateBranchHistory(cwd: string, branch: string): void {
  branchHistory.set(cwd, branch);
}

export function hasBranchChanged(cwd: string): boolean {
  const lastBranch = getLastBranch(cwd);
  if (!lastBranch) {
    // First time seeing this directory, not a change
    return false;
  }
  const currentBranch = branchHistory.get(cwd);
  return currentBranch !== lastBranch;
}

export async function checkBranchChange(cwd: string): Promise<string | undefined> {
  const currentBranch = await getCurrentGitBranch(cwd);
  if (!currentBranch) return undefined;

  const lastBranch = getLastBranch(cwd);
  
  if (currentBranch !== lastBranch) {
    console.error(`[branch] Changed from '${lastBranch ?? "none"}' to '${currentBranch}'`);
    updateBranchHistory(cwd, currentBranch);
    return lastBranch; // Return previous (different) branch
  }

  // Same branch, just update the timestamp
  updateBranchHistory(cwd, currentBranch);
  return undefined;
}
