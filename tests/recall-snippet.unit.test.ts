import { describe, expect, it } from "vitest";

import { isoDateString, memoryId } from "../src/brands.js";
import { formatNote, formatNoteBrief } from "../src/helpers/index.js";
import { selectQuerySnippet } from "../src/recall-snippet.js";
import type { Note } from "../src/storage.js";

const BODY = [
  "Order events go through an outbox table.",
  "## Tuning",
  "The dispatcher polls every 250 milliseconds and publishes in batches of 200 rows.",
  "Rows are claimed with SKIP LOCKED so two replicas never publish the same row.",
  "```ts\nconst replicas = 2; // replicas never publish twice\n```",
].join("\n\n");

describe("selectQuerySnippet", () => {
  it("returns the paragraph sharing the most query terms", () => {
    expect(selectQuerySnippet(BODY, "how do replicas avoid publishing the same row", "")).toBe(
      "Rows are claimed with SKIP LOCKED so two replicas never publish the same row.",
    );
  });

  it("returns undefined when no paragraph shares a query term", () => {
    expect(selectQuerySnippet(BODY, "kubernetes autoscaling", "")).toBeUndefined();
  });

  it("ignores headings and fenced code", () => {
    expect(selectQuerySnippet(BODY, "tuning", "")).toBeUndefined();
    expect(selectQuerySnippet(BODY, "const", "")).toBeUndefined();
  });

  it("weighs terms unique to one paragraph above terms that appear everywhere", () => {
    const body = [
      "Die Tabelle wird in der Transaktion geschrieben und der Dispatcher liest die Tabelle.",
      "Die Zeilen werden mit SKIP LOCKED gesperrt und der Dispatcher veröffentlicht die Zeilen.",
      "Die Aufbewahrung der Zeilen dauert sieben Tage und die Tabelle wird der Reihe nach bereinigt.",
    ].join("\n\n");
    // "die" and "der" appear in every paragraph; "locked" in one.
    expect(selectQuerySnippet(body, "die der locked", "")).toContain("SKIP LOCKED");
  });

  it("does not repeat the summary", () => {
    const summary = "Order events go through an outbox table.";
    expect(selectQuerySnippet(BODY, "outbox table", summary)).toBeUndefined();
  });

  it("matches identifiers through the identifier-aware tokenizer", () => {
    const body = "Intro.\n\nSet `OUTBOX_POLL_INTERVAL_MS` to tune the dispatcher.";
    expect(selectQuerySnippet(body, "outboxPollIntervalMs", "Intro.")).toBe(
      "Set `OUTBOX_POLL_INTERVAL_MS` to tune the dispatcher.",
    );
  });

  it("windows long paragraphs around the first match on word boundaries", () => {
    const paragraph = `${"lead words ".repeat(60)}the idempotency key store dedupes deliveries ${"tail words ".repeat(60)}`;
    const snippet = selectQuerySnippet(
      `Intro.\n\n${paragraph}`,
      "idempotency store",
      "Intro.",
      120,
    );

    expect(snippet).toBeDefined();
    expect(snippet!.length).toBeLessThanOrEqual(122);
    expect(snippet).toMatch(/^….*idempotency key store.*…$/);
    expect(snippet).not.toMatch(/^…\S*ords /);
  });
});

describe("recall note formatting", () => {
  const note: Note = {
    id: memoryId("outbox-decision-1a2b3c4d"),
    title: "Outbox decision",
    content: BODY,
    tags: ["decision"],
    lifecycle: "permanent",
    role: "decision",
    project: "https-github-com-acme-alpha",
    projectName: "alpha",
    createdAt: isoDateString("2026-01-01T00:00:00.000Z"),
    updatedAt: isoDateString("2026-02-01T00:00:00.000Z"),
  };

  it("keeps the full format unchanged", () => {
    expect(formatNote(note, 0.5)).toBe(
      "## Outbox decision\n" +
        "**id:** `outbox-decision-1a2b3c4d` | project: alpha | similarity: 0.500\n" +
        "**tags:** decision | **lifecycle: permanent** | **role: decision** | **updated:** 2026-02-01T00:00:00.000Z\n\n" +
        BODY,
    );
  });

  it("renders the same header with summary and snippet instead of the body", () => {
    const brief = formatNoteBrief(note, {
      score: 0.5,
      showRawRelated: true,
      summary: "Order events go through an outbox table.",
      snippet: "Rows are claimed with SKIP LOCKED.",
    });

    expect(brief).toBe(
      `${formatNote(note, 0.5).split("\n\n")[0]}\n\n` +
        "Order events go through an outbox table.\n> Rows are claimed with SKIP LOCKED.",
    );
    expect(brief).not.toContain("batches of 200 rows");
  });
});
