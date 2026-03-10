import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import type { EvalProvider } from "./provider.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import { OpenAIProvider } from "./providers/openai.js";
import { runScenario, type ScenarioResult } from "./harness.js";
import { TOOLS } from "./tools.js";
import { sessionStart } from "./scenarios/session-start.js";
import { recallBeforeRemember } from "./scenarios/recall-before-remember.js";
import { lifecyclePermanent, lifecycleTemporary } from "./scenarios/lifecycle-selection.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const systemPrompt = readFileSync(resolve(__dirname, "../SYSTEM_PROMPT.md"), "utf-8");

const SCENARIOS = [sessionStart, recallBeforeRemember, lifecyclePermanent, lifecycleTemporary];

function buildProvider(): EvalProvider {
  const providerName = process.env["PROVIDER"] ?? "anthropic";
  const model = process.env["MODEL"];

  switch (providerName) {
    case "anthropic":
      return new AnthropicProvider(model ?? "claude-sonnet-4-6");
    case "openai":
      return new OpenAIProvider(model ?? "gpt-4o");
    default:
      throw new Error(`Unknown PROVIDER '${providerName}'. Use 'anthropic' or 'openai'.`);
  }
}

function printResult(result: ScenarioResult): void {
  const icon = result.passed ? "✓" : "✗";
  const status = result.passed ? "PASS" : "FAIL";
  console.log(`\n${icon} [${status}] ${result.scenario}`);
  console.log(`  tool calls: ${result.toolCallSequence.join(" → ") || "(none)"}`);
  if (!result.passed) {
    for (const failure of result.failures) {
      console.log(`  ! ${failure}`);
    }
  }
}

async function main(): Promise<void> {
  const provider = buildProvider();
  console.log(`Running evals with provider: ${provider.name}`);
  console.log(`Scenarios: ${SCENARIOS.length}`);
  console.log("─".repeat(60));

  const results: ScenarioResult[] = [];

  for (const scenario of SCENARIOS) {
    process.stdout.write(`  ${scenario.name} ... `);
    try {
      const result = await runScenario(provider, scenario, systemPrompt, TOOLS);
      results.push(result);
      process.stdout.write(result.passed ? "PASS\n" : "FAIL\n");
      if (!result.passed) {
        printResult(result);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      results.push({
        scenario: scenario.name,
        passed: false,
        toolCallSequence: [],
        failures: [`Error: ${errMsg}`],
      });
      process.stdout.write("ERROR\n");
      console.log(`  ! ${errMsg}`);
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  console.log("\n" + "─".repeat(60));
  console.log(`Results: ${passed}/${total} passed`);

  if (passed < total) {
    console.log("\nFailed scenarios:");
    for (const result of results.filter((r) => !r.passed)) {
      printResult(result);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
