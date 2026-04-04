import { describe, expect, it } from "vitest";

import {
  normalizeText,
  tokenize,
  jaccardSimilarity,
  bigramJaccardSimilarity,
  containsSubstring,
  computeLexicalScore,
  shouldTriggerLexicalRescue,
  LEXICAL_RESCUE_CANDIDATE_LIMIT,
  LEXICAL_RESCUE_THRESHOLD,
  LEXICAL_RESCUE_RESULT_LIMIT,
} from "../src/lexical.js";

describe("normalizeText", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeText("Hello, World!")).toBe("hello world");
  });

  it("collapses whitespace", () => {
    expect(normalizeText("  hello   world  ")).toBe("hello world");
  });

  it("handles unicode letters", () => {
    expect(normalizeText("café naïve")).toBe("café naïve");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeText("")).toBe("");
    expect(normalizeText("   ")).toBe("");
  });

  it("removes special characters but keeps alphanumeric", () => {
    expect(normalizeText("test-case_with.special")).toBe("test case with special");
  });
});

describe("tokenize", () => {
  it("splits text into tokens", () => {
    expect(tokenize("hello world")).toEqual(["hello", "world"]);
  });

  it("filters empty tokens", () => {
    expect(tokenize("  ")).toEqual([]);
  });

  it("normalizes before splitting", () => {
    expect(tokenize("Hello, World!")).toEqual(["hello", "world"]);
  });
});

describe("jaccardSimilarity", () => {
  it("returns 1 for identical sets", () => {
    expect(jaccardSimilarity(new Set(["a", "b"]), new Set(["a", "b"]))).toBe(1);
  });

  it("returns 0 for disjoint sets", () => {
    expect(jaccardSimilarity(new Set(["a"]), new Set(["b"]))).toBe(0);
  });

  it("returns 0.5 for half overlap", () => {
    expect(jaccardSimilarity(new Set(["a", "b"]), new Set(["b", "c"]))).toBeCloseTo(0.333, 2);
  });

  it("returns 0 for empty sets", () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(0);
  });

  it("handles asymmetric sets", () => {
    expect(jaccardSimilarity(new Set(["a"]), new Set(["a", "b", "c"]))).toBeCloseTo(0.333, 2);
  });
});

describe("bigramJaccardSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(bigramJaccardSimilarity("hello", "hello")).toBe(1);
  });

  it("returns 0 for completely different strings", () => {
    expect(bigramJaccardSimilarity("abc", "xyz")).toBe(0);
  });

  it("handles short strings", () => {
    expect(bigramJaccardSimilarity("a", "b")).toBe(0);
  });

  it("detects partial phrase overlap", () => {
    const score = bigramJaccardSimilarity("hello world", "hello there");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });
});

describe("containsSubstring", () => {
  it("finds exact substring", () => {
    expect(containsSubstring("hello world", "world")).toBe(true);
  });

  it("is case insensitive", () => {
    expect(containsSubstring("Hello World", "WORLD")).toBe(true);
  });

  it("returns false when not found", () => {
    expect(containsSubstring("hello world", "foo")).toBe(false);
  });

  it("handles empty needle", () => {
    expect(containsSubstring("hello", "")).toBe(true);
  });
});

describe("computeLexicalScore", () => {
  it("returns 1.0 for exact match", () => {
    expect(computeLexicalScore("hello world", "hello world")).toBe(1);
  });

  it("returns high score for substring match", () => {
    const score = computeLexicalScore("hello world", "this is a hello world example");
    expect(score).toBeGreaterThan(0.5);
  });

  it("returns low score for unrelated text", () => {
    const score = computeLexicalScore("quantum physics", "cooking recipes");
    expect(score).toBeLessThan(0.2);
  });

  it("returns 0 for empty inputs", () => {
    expect(computeLexicalScore("", "hello")).toBe(0);
    expect(computeLexicalScore("hello", "")).toBe(0);
  });

  it("handles partial overlap", () => {
    const score = computeLexicalScore("design decisions", "key design decisions for the system");
    expect(score).toBeGreaterThan(0.3);
  });

  it("is case insensitive", () => {
    const score1 = computeLexicalScore("Hello World", "hello world");
    const score2 = computeLexicalScore("hello world", "hello world");
    expect(score1).toBe(score2);
  });
});

describe("shouldTriggerLexicalRescue", () => {
  it("triggers when no semantic results", () => {
    expect(shouldTriggerLexicalRescue(undefined, 0)).toBe(true);
  });

  it("triggers when top score is weak", () => {
    expect(shouldTriggerLexicalRescue(0.2, 3)).toBe(true);
  });

  it("does not trigger when top score is strong", () => {
    expect(shouldTriggerLexicalRescue(0.7, 5)).toBe(false);
  });

  it("triggers at boundary", () => {
    expect(shouldTriggerLexicalRescue(0.34, 2)).toBe(true);
  });

  it("does not trigger just above boundary", () => {
    expect(shouldTriggerLexicalRescue(0.36, 2)).toBe(false);
  });
});

describe("lexical constants", () => {
  it("has reasonable rescue candidate limit", () => {
    expect(LEXICAL_RESCUE_CANDIDATE_LIMIT).toBeGreaterThan(0);
    expect(LEXICAL_RESCUE_CANDIDATE_LIMIT).toBeLessThanOrEqual(50);
  });

  it("has reasonable rescue threshold", () => {
    expect(LEXICAL_RESCUE_THRESHOLD).toBeGreaterThan(0);
    expect(LEXICAL_RESCUE_THRESHOLD).toBeLessThan(1);
  });

  it("has reasonable result limit", () => {
    expect(LEXICAL_RESCUE_RESULT_LIMIT).toBeGreaterThan(0);
    expect(LEXICAL_RESCUE_RESULT_LIMIT).toBeLessThanOrEqual(10);
  });
});
