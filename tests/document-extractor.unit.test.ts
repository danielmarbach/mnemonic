import { describe, it, expect, vi } from "vitest";
import type { DocumentExtractor } from "../src/retrieval-document.js";

// Helper to get a fresh module instance by resetting the module registry
async function getFreshModule() {
  vi.resetModules();
  return import("../src/document-extractor.js");
}

function makeExtractor(id: string, mediaType: string, content: string): DocumentExtractor {
  return {
    extractorId: id,
    extractorVersion: "1.0.0",
    sourceMediaType: mediaType,
    extractedContentMediaType: mediaType,
    detect(_filePath: string, _bytes: Uint8Array): boolean {
      return true;
    },
    extract(
      _filePath: string,
      _bytes: Uint8Array,
      _encoding: string,
    ): { content: string; metadata: Record<string, unknown> } {
      return { content, metadata: {} };
    },
  };
}

describe("registerExtractor and getExtractor", () => {
  it("round-trips a registered extractor", async () => {
    const mod = await getFreshModule();
    const ext = makeExtractor("test-extractor", "text/plain", "test");
    mod.registerExtractor(ext);
    const retrieved = mod.getExtractor("text/plain");
    expect(retrieved).toBeDefined();
    expect(retrieved!.extractorId).toBe("test-extractor");
    expect(retrieved!.sourceMediaType).toBe("text/plain");
  });

  it("returns undefined for unregistered media type", async () => {
    const mod = await getFreshModule();
    const retrieved = mod.getExtractor("application/pdf");
    expect(retrieved).toBeUndefined();
  });

  it("overwrites when registering same media type twice", async () => {
    const mod = await getFreshModule();
    mod.registerExtractor(makeExtractor("original", "text/plain", "original"));
    mod.registerExtractor(makeExtractor("replacement", "text/plain", "replaced"));
    const retrieved = mod.getExtractor("text/plain");
    expect(retrieved!.extractorId).toBe("replacement");
  });
});

describe("getRegisteredMediaTypes", () => {
  it("returns empty array when no extractors registered", async () => {
    const mod = await getFreshModule();
    expect(mod.getRegisteredMediaTypes()).toEqual([]);
  });

  it("returns all registered media types", async () => {
    const mod = await getFreshModule();
    mod.registerExtractor(makeExtractor("txt", "text/plain", "test"));
    mod.registerExtractor(makeExtractor("md", "text/markdown", "# Hello"));
    const types = mod.getRegisteredMediaTypes();
    expect(types).toContain("text/plain");
    expect(types).toContain("text/markdown");
    expect(types.length).toBe(2);
  });
});

describe("validateAcceptedMediaTypes", () => {
  it("returns all as supported when all are registered", async () => {
    const mod = await getFreshModule();
    mod.registerExtractor(makeExtractor("txt", "text/plain", "test"));
    const result = mod.validateAcceptedMediaTypes(["text/plain"]);
    expect(result.supported).toEqual(["text/plain"]);
    expect(result.unsupported).toEqual([]);
  });

  it("returns unsupported for unregistered media types", async () => {
    const mod = await getFreshModule();
    mod.registerExtractor(makeExtractor("txt", "text/plain", "test"));
    const result = mod.validateAcceptedMediaTypes(["text/plain", "application/pdf"]);
    expect(result.supported).toEqual(["text/plain"]);
    expect(result.unsupported).toEqual(["application/pdf"]);
  });

  it("handles mixed supported and unsupported", async () => {
    const mod = await getFreshModule();
    mod.registerExtractor(makeExtractor("txt", "text/plain", "test"));
    mod.registerExtractor(makeExtractor("md", "text/markdown", "# Hello"));
    const result = mod.validateAcceptedMediaTypes([
      "text/plain",
      "text/markdown",
      "application/pdf",
      "text/html",
    ]);
    expect(result.supported).toEqual(["text/plain", "text/markdown"]);
    expect(result.unsupported).toEqual(["application/pdf", "text/html"]);
  });

  it("returns empty supported when no extractors registered", async () => {
    const mod = await getFreshModule();
    const result = mod.validateAcceptedMediaTypes(["text/plain"]);
    expect(result.supported).toEqual([]);
    expect(result.unsupported).toEqual(["text/plain"]);
  });
});
