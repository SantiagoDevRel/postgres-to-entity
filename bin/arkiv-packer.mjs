#!/usr/bin/env node
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { generateModel, modelMarkdown } from "../dist/postgres.js";

const args = process.argv.slice(2);
if (args.includes("--help") || !args.length) {
  console.log("postgres-to-entity <request.json|schema.sql|-> [--format json|markdown] [--out NEW_FILE]\n\nSQL files generate a draft. JSON requests add filters, privacy decisions and lifecycle policies.\nstdin (-) expects JSON. No network or database access. Output files must not exist.\nExit codes: 0 modelled, 2 needs-input, 3 blocked, 1 input/output error.");
  process.exit(0);
}
try {
  const input = args.shift();
  let format = "json", output;
  while (args.length) {
    const flag = args.shift(), value = args.shift();
    if (flag === "--format" && ["json", "markdown"].includes(value)) format = value;
    else if (flag === "--out" && value) output = resolve(value);
    else throw new Error("Unknown or incomplete option: " + flag);
  }
  if (input !== "-" && statSync(input).size > 1_000_000) throw new Error("Input exceeds 1 MB.");
  const raw = readFileSync(input === "-" ? 0 : input, "utf8").replace(/^\uFEFF/, "");
  if (Buffer.byteLength(raw) > 1_000_000) throw new Error("Input exceeds 1 MB.");
  const request = input?.toLowerCase().endsWith(".sql") ? { sql: raw } : JSON.parse(raw);
  const model = generateModel(request);
  const text = format === "markdown" ? modelMarkdown(model) : JSON.stringify(model, null, 2) + "\n";
  if (output) writeFileSync(output, text, { flag: "wx" });
  else process.stdout.write(text);
  process.exitCode = model.status === "blocked" ? 3 : model.status === "needs-input" ? 2 : 0;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
