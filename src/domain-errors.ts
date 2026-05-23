// Domain error classes — replaces bare `new Error(...)` in domain logic.
// Enforced by ast-grep rule: no-bare-new-error

export class AtomicWriteInProgressError extends Error {
  constructor() {
    super("Atomic notes write already in progress");
    this.name = "AtomicWriteInProgressError";
  }
}

export class MalformedNoteError extends Error {
  constructor(id: string) {
    super(`Malformed note '${id}': missing frontmatter`);
    this.name = "MalformedNoteError";
  }
}

export class InvalidNoteIdError extends Error {
  constructor(id: string) {
    super(
      `Invalid note ID: "${id}" contains characters that are not allowed (only alphanumeric, hyphens, and underscores)`,
    );
    this.name = "InvalidNoteIdError";
  }
}

export class VaultNotFoundError extends Error {
  constructor() {
    super("Vault not found");
    this.name = "VaultNotFoundError";
  }
}

export class OllamaUrlError extends Error {
  constructor(reason: string, detail: string) {
    super(reason + ": " + detail);
    this.name = "OllamaUrlError";
  }
}

export class OllamaEmbeddingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OllamaEmbeddingError";
  }
}

export class EmbeddingConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingConfigurationError";
  }
}

export class EmbeddingProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingProviderError";
  }
}

export class EmbeddingDimensionMismatchError extends Error {
  constructor(left: number, right: number) {
    super(`Embedding dimensions must match: ${left} !== ${right}`);
    this.name = "EmbeddingDimensionMismatchError";
  }
}

export class UnknownConsolidationModeError extends Error {
  constructor(mode: never) {
    super(`Unknown consolidation mode: ${mode}`);
    this.name = "UnknownConsolidationModeError";
  }
}

export class UnknownMigrationError extends Error {
  constructor(migrationName: string) {
    super(`Unknown migration: ${migrationName}`);
    this.name = "UnknownMigrationError";
  }
}

export class InvalidSchemaVersionError extends Error {
  constructor(version: string) {
    super(`Invalid schema version: ${version}`);
    this.name = "InvalidSchemaVersionError";
  }
}

export class GitLockRetriesExhaustedError extends Error {
  constructor(operationName: string) {
    super(`[git] ${operationName}() lock retries exhausted`);
    this.name = "GitLockRetriesExhaustedError";
  }
}

export class UnknownRecoveryKindError extends Error {
  constructor(kind: never) {
    super(`Unknown recovery kind: ${kind}`);
    this.name = "UnknownRecoveryKindError";
  }
}

export class UnknownMutationPushModeError extends Error {
  constructor(mode: never) {
    super(`Unknown mutation push mode: ${mode}`);
    this.name = "UnknownMutationPushModeError";
  }
}

export class UnknownChangeCategoryError extends Error {
  constructor(category: never) {
    super(`Unhandled change category: ${category}`);
    this.name = "UnknownChangeCategoryError";
  }
}

export class SemanticPatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SemanticPatchError";
  }
}

export class MigrationAlreadyRegisteredError extends Error {
  constructor(name: string) {
    super(`Migration already registered: ${name}`);
    this.name = "MigrationAlreadyRegisteredError";
  }
}

export class UnknownRelationshipTypeError extends Error {
  constructor(type: never) {
    super(`Unhandled relationship type: ${type}`);
    this.name = "UnknownRelationshipTypeError";
  }
}

export class InvalidBranchNameError extends Error {
  constructor(branch: string, pattern: string) {
    super(`Invalid branch name: "${branch}". Branch names must match ${pattern}`);
    this.name = "InvalidBranchNameError";
  }
}

export class AttachedVaultReadOnlyError extends Error {
  constructor(operation: string) {
    super(`Cannot ${operation} to attached vault`);
    this.name = "AttachedVaultReadOnlyError";
  }
}
