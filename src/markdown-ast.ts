import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import type { Root } from "mdast";

export function parseBody(content: string): Root {
  return unified().use(remarkParse).parse(content) as Root;
}

export function serializeBody(tree: Root): string {
  return unified().use(remarkStringify, { bullet: "-" }).stringify(tree) as string;
}
