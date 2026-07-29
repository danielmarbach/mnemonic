import { describe, it, expect } from "vitest";
import {
  guardAgainstDocumentSourceMutation,
  guardIdsAgainstDocumentSourceMutation,
} from "../src/mutation-guard.js";
import { ImmutableDocumentSourceError } from "../src/domain-errors.js";

describe("guardAgainstDocumentSourceMutation", () => {
  it("throws ImmutableDocumentSourceError for doc: prefixed IDs", () => {
    expect(() => guardAgainstDocumentSourceMutation("doc:my-attachment::my-doc", "update")).toThrow(
      ImmutableDocumentSourceError,
    );
  });

  it("throws ImmutableDocumentSourceError for chunk: prefixed IDs", () => {
    expect(() =>
      guardAgainstDocumentSourceMutation("chunk:my-attachment::my-doc::heading::0::0", "forget"),
    ).toThrow(ImmutableDocumentSourceError);
  });

  it("includes the operation name in the error message", () => {
    expect(() => guardAgainstDocumentSourceMutation("doc:test-id", "update")).toThrow(/update/);
  });

  it("includes the ID in the error message", () => {
    expect(() => guardAgainstDocumentSourceMutation("doc:test-id", "update")).toThrow(/test-id/);
  });

  it("does NOT throw for regular Memory IDs (alphanumeric with hyphens/underscores)", () => {
    expect(() => guardAgainstDocumentSourceMutation("my-note-id", "update")).not.toThrow();
    expect(() => guardAgainstDocumentSourceMutation("research_plan_2026", "forget")).not.toThrow();
    expect(() => guardAgainstDocumentSourceMutation("abc123", "relate")).not.toThrow();
  });

  it("does NOT throw for unknown ID patterns", () => {
    // IDs that don't match doc:/chunk: prefix and don't match memory pattern
    expect(() => guardAgainstDocumentSourceMutation("some@invalid", "update")).not.toThrow();
    expect(() => guardAgainstDocumentSourceMutation("", "update")).not.toThrow();
  });
});

describe("guardIdsAgainstDocumentSourceMutation", () => {
  it("throws if ANY id in the array is a document ref", () => {
    expect(() =>
      guardIdsAgainstDocumentSourceMutation(
        ["valid-note", "another-note", "doc:att::path"],
        "update",
      ),
    ).toThrow(ImmutableDocumentSourceError);
  });

  it("throws if ANY id in the array is a chunk ref", () => {
    expect(() =>
      guardIdsAgainstDocumentSourceMutation(["valid-note", "chunk:att::path::h::0::0"], "forget"),
    ).toThrow(ImmutableDocumentSourceError);
  });

  it("does NOT throw if all ids are regular Memory IDs", () => {
    expect(() =>
      guardIdsAgainstDocumentSourceMutation(["note-one", "note-two", "research_plan"], "update"),
    ).not.toThrow();
  });

  it("does NOT throw for an empty array", () => {
    expect(() => guardIdsAgainstDocumentSourceMutation([], "update")).not.toThrow();
  });

  it("throws on the first document ref encountered", () => {
    // Should throw for the doc: ref even though there are valid IDs before it
    expect(() =>
      guardIdsAgainstDocumentSourceMutation(
        ["valid-note", "doc:att::path", "another-valid"],
        "update",
      ),
    ).toThrow(ImmutableDocumentSourceError);
  });
});
