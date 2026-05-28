import type { Root, Content, Heading, Paragraph, Blockquote, List } from "mdast";
import { parseBody, serializeBody } from "./markdown-ast.js";
import { attemptCleanMarkdown } from "./markdown.js";
import { SemanticPatchError } from "./domain-errors.js";

export type SemanticSelector =
  | { heading: string }
  | { headingStartsWith: string }
  | { section: string }
  | { nthChild: number }
  | { lastChild: true };

export type SemanticOperation =
  | { op: "appendChild"; value: string }
  | { op: "prependChild"; value: string }
  | { op: "replace"; value: string }
  | { op: "replaceSection"; value: string }
  | { op: "replaceChildren"; value: string }
  | { op: "insertAfter"; value: string }
  | { op: "insertBefore"; value: string }
  | { op: "remove" };

export interface SemanticPatch {
  selector: SemanticSelector;
  operation: SemanticOperation;
}

function getHeadingText(node: Heading): string {
  return node.children
    .filter((c): c is { type: "text"; value: string } => c.type === "text")
    .map((c) => c.value)
    .join("");
}

function isHeadingNode(node: Content): node is Heading {
  return node.type === "heading";
}

function findHeadingIndex(
  tree: Root,
  predicate: (heading: Heading) => boolean,
): number | undefined {
  for (let i = 0; i < tree.children.length; i++) {
    const child = tree.children[i];
    if (child && isHeadingNode(child) && predicate(child)) {
      return i;
    }
  }
  return undefined;
}

function sectionEndIndex(tree: Root, headingIndex: number): number {
  const heading = tree.children[headingIndex];
  if (!heading || !isHeadingNode(heading)) {
    return headingIndex + 1;
  }

  for (let i = headingIndex + 1; i < tree.children.length; i++) {
    const child = tree.children[i];
    if (child && isHeadingNode(child) && child.depth <= heading.depth) {
      return i;
    }
  }
  return tree.children.length;
}

function resolveSelector(
  tree: Root,
  selector: SemanticSelector,
): { parent: Root; index: number; target: Content } | undefined {
  if ("heading" in selector) {
    const index = findHeadingIndex(tree, (heading) => getHeadingText(heading) === selector.heading);
    if (index !== undefined) {
      const target = tree.children[index];
      if (target) return { parent: tree, index, target };
    }
    return undefined;
  }

  if ("headingStartsWith" in selector) {
    const index = findHeadingIndex(tree, (heading) =>
      getHeadingText(heading).startsWith(selector.headingStartsWith),
    );
    if (index !== undefined) {
      const target = tree.children[index];
      if (target) return { parent: tree, index, target };
    }
    return undefined;
  }

  if ("section" in selector) {
    const index = findHeadingIndex(tree, (heading) => getHeadingText(heading) === selector.section);
    if (index !== undefined) {
      const target = tree.children[index];
      if (target) return { parent: tree, index, target };
    }
    return undefined;
  }

  if ("nthChild" in selector) {
    const index = selector.nthChild;
    if (index < 0 || index >= tree.children.length) {
      return undefined;
    }
    const target = tree.children[index];
    if (!target) return undefined;
    return { parent: tree, index, target };
  }

  if ("lastChild" in selector) {
    if (tree.children.length === 0) {
      return undefined;
    }
    const index = tree.children.length - 1;
    const target = tree.children[index];
    if (!target) return undefined;
    return { parent: tree, index, target };
  }

  return undefined;
}

const CONTAINER_TYPES = new Set(["blockquote", "list", "paragraph"]);

function getTargetChildren(target: Content): Content[] | undefined {
  if (CONTAINER_TYPES.has(target.type)) {
    return (target as Heading | Blockquote | List | Paragraph).children as Content[];
  }
  return undefined;
}

function parseValueNodes(value: string): Content[] {
  const fragment = parseBody(value);
  return fragment.children;
}

function throwIfHeadingReplaceLooksLikeSectionReplace(
  target: Content,
  selector: SemanticSelector,
  op: SemanticOperation,
): void {
  if (
    op.op !== "replace" ||
    !("heading" in selector || "headingStartsWith" in selector) ||
    !isHeadingNode(target)
  ) {
    return;
  }

  const newNodes = parseValueNodes(op.value);
  if (
    !newNodes.some((node) => isHeadingNode(node) && getHeadingText(node) === getHeadingText(target))
  ) {
    return;
  }

  throw new SemanticPatchError(
    "Heading `replace` only replaces the heading node and leaves the existing section body intact. " +
      'Use `{ selector: { section: "..." }, operation: { op: "replaceSection", value: "..." } }` to replace a whole section.',
  );
}

function collectAvailableHeadings(tree: Root): string[] {
  const headings: string[] = [];
  for (const child of tree.children) {
    if (isHeadingNode(child)) {
      headings.push(getHeadingText(child));
    }
  }
  return headings;
}

export async function applySemanticPatches(
  body: string,
  patches: SemanticPatch[],
): Promise<{ content: string; lintWarnings: string[] }> {
  const tree = parseBody(body);

  for (const patch of patches) {
    const resolved = resolveSelector(tree, patch.selector);
    if (!resolved) {
      const headings = collectAvailableHeadings(tree);
      let diagnostic = `Selector not found: ${JSON.stringify(patch.selector)}`;
      if (headings.length > 0) {
        diagnostic += `\nAvailable headings:\n${headings.map((h) => `  - ${h}`).join("\n")}`;
        diagnostic += `\nUse exact heading text (without ## prefix), e.g.: { "selector": { "heading": "${headings[0]}" } }`;
        if ("heading" in patch.selector) {
          diagnostic += `\nTip: use headingStartsWith for prefix matching when exact headings are uncertain.`;
        }
      } else {
        diagnostic += "\nNo headings in document.";
      }
      throw new SemanticPatchError(diagnostic);
    }

    const { parent, index, target } = resolved;
    const op = patch.operation;
    throwIfHeadingReplaceLooksLikeSectionReplace(target, patch.selector, op);

    switch (op.op) {
      case "appendChild": {
        const targetChildren = getTargetChildren(target);
        if (!targetChildren) {
          throw new SemanticPatchError(`Cannot appendChild to node of type '${target.type}'`);
        }
        const newNodes = parseValueNodes(op.value);
        targetChildren.push(...newNodes);
        break;
      }
      case "prependChild": {
        const targetChildren = getTargetChildren(target);
        if (!targetChildren) {
          throw new SemanticPatchError(`Cannot prependChild to node of type '${target.type}'`);
        }
        const newNodes = parseValueNodes(op.value);
        targetChildren.unshift(...newNodes);
        break;
      }
      case "replace": {
        const newNodes = parseValueNodes(op.value);
        parent.children.splice(index, 1, ...newNodes);
        break;
      }
      case "replaceSection": {
        if (!isHeadingNode(target) || !("section" in patch.selector)) {
          throw new SemanticPatchError("replaceSection requires a section selector");
        }
        const newNodes = parseValueNodes(op.value);
        parent.children.splice(index, sectionEndIndex(parent, index) - index, ...newNodes);
        break;
      }
      case "replaceChildren": {
        const targetChildren = getTargetChildren(target);
        if (!targetChildren) {
          throw new SemanticPatchError(`Cannot replaceChildren of node of type '${target.type}'`);
        }
        const newNodes = parseValueNodes(op.value);
        targetChildren.length = 0;
        targetChildren.push(...newNodes);
        break;
      }
      case "insertAfter": {
        const newNodes = parseValueNodes(op.value);
        parent.children.splice(index + 1, 0, ...newNodes);
        break;
      }
      case "insertBefore": {
        const newNodes = parseValueNodes(op.value);
        parent.children.splice(index, 0, ...newNodes);
        break;
      }
      case "remove": {
        parent.children.splice(index, 1);
        break;
      }
      default: {
        const _exhaustive: never = op;
        throw new SemanticPatchError(`Unknown operation: ${_exhaustive}`);
      }
    }
  }

  const serialized = serializeBody(tree);
  const { cleaned, warnings } = await attemptCleanMarkdown(serialized);
  return { content: cleaned, lintWarnings: warnings };
}
