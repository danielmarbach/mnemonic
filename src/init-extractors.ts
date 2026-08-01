import { registerExtractor } from "./document-extractor.js";
import { markdownExtractor } from "./markdown-extractor.js";

// Register built-in extractors at server startup.
// This is intentionally a side-effect-ful module imported once at server
// initialization, not from document-source-index.ts (which would pollute
// test isolation when tests import buildGenerationFromFiles).
registerExtractor(markdownExtractor);
