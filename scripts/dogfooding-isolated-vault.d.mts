/**
 * Type declarations for `dogfooding-isolated-vault.mjs`.
 * The script is plain ESM JavaScript; this file provides the types consumed by
 * the tests that import it. Keep the shapes in sync with the implementation.
 */

export interface IsolatedDogfoodVault {
  tempRoot: string;
  vaultPath: string;
  cleanup: () => Promise<void>;
}

export interface DogfoodRunResult {
  usedIsolatedVault: boolean;
  vaultPath: string;
  tempRoot: string;
  cleanedUp: boolean;
}

export declare function createIsolatedDogfoodVault(
  sourceVaultPath: string,
): Promise<IsolatedDogfoodVault>;

export declare function runDogfoodInIsolation(options: {
  sourceVaultPath: string;
  dryRun?: boolean;
}): Promise<DogfoodRunResult>;
