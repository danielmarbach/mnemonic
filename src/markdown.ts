import { applyFixes, type LintError } from "markdownlint";
import { lint } from "markdownlint/promise";

const markdownLintConfig = {
  default: true,
  MD013: false,
  MD041: false,
};

function formatIssue(issue: LintError): string {
  const [ruleName, ruleAlias] = issue.ruleNames;
  const rule = ruleAlias ? `${ruleName}/${ruleAlias}` : ruleName;
  const detail = issue.errorDetail ?? issue.errorContext;
  return detail
    ? `line ${issue.lineNumber}: ${rule} ${issue.ruleDescription} (${detail})`
    : `line ${issue.lineNumber}: ${rule} ${issue.ruleDescription}`;
}

async function lintMarkdown(markdown: string): Promise<LintError[]> {
  const results = await lint({
    strings: { content: markdown },
    config: markdownLintConfig,
  });

  return results["content"] ?? [];
}

export class MarkdownLintError extends Error {
  constructor(readonly issues: string[]) {
    super(`Markdown lint failed:\n- ${issues.join("\n- ")}`);
    this.name = "MarkdownLintError";
  }
}

export async function cleanMarkdown(markdown: string): Promise<string> {
  let current = markdown.replace(/\r\n/g, "\n");

  for (let attempt = 0; attempt < 3; attempt++) {
    const issues = await lintMarkdown(current);
    const fixable = issues.filter((issue) => issue.fixInfo);
    if (fixable.length === 0) {
      break;
    }

    const fixed = applyFixes(current, issues);
    if (fixed === current) {
      break;
    }

    current = fixed;
  }

  const remainingIssues = await lintMarkdown(current);
  if (remainingIssues.length > 0) {
    throw new MarkdownLintError(remainingIssues.map(formatIssue));
  }

  return current.replace(/^\n+/, "").replace(/\n+$/, "");
}
