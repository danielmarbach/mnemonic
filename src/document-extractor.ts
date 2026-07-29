import type { DocumentExtractor } from "./retrieval-document.js";

// Media-type extractor registry
const extractors = new Map<string, DocumentExtractor>();

export function registerExtractor(extractor: DocumentExtractor): void {
  extractors.set(extractor.sourceMediaType, extractor);
}

export function getExtractor(mediaType: string): DocumentExtractor | undefined {
  return extractors.get(mediaType);
}

export function getRegisteredMediaTypes(): string[] {
  return Array.from(extractors.keys());
}

// Validate that acceptedMediaTypes are all registered
export function validateAcceptedMediaTypes(acceptedMediaTypes: string[]): {
  supported: string[];
  unsupported: string[];
} {
  const supported: string[] = [];
  const unsupported: string[] = [];
  for (const mt of acceptedMediaTypes) {
    if (extractors.has(mt)) {
      supported.push(mt);
    } else {
      unsupported.push(mt);
    }
  }
  return { supported, unsupported };
}

// Representation names documentation:
// - sourceMediaType: describes source bytes (e.g., "text/markdown")
// - extractedContentMediaType: describes extractor output used for chunking
// - chunkContentMediaType: describes derived chunk text
// - excerptContentMediaType: describes derived excerpt text
// - contentMediaType: describes content returned by get
