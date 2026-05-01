import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import type { Root } from "mdast";

const parser = unified().use(remarkParse);
const serializer = unified().use(remarkStringify, { bullet: "-" });

export function parseBody(content: string): Root {
  return parser.parse(content) as Root;
}

export function serializeBody(tree: Root): string {
  return serializer.stringify(tree) as string;
}
