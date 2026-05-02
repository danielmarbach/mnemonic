export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function debugLog(scope: string, message: string): void {
  if (process.env.MNEMONIC_DEBUG) {
    console.error(`[${scope}] ${message}`);
  }
}