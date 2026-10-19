#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const { validateIntent, isValidSS58, SUPPORTED_ACTIONS, SUPPORTED_ASSETS } = require("../src/intent");
const { toBaseUnits } = require("../src/amount");

const EXIT_OK = 0;
const EXIT_INVALID = 1;
const EXIT_USAGE = 2;
const EXIT_UNKNOWN_COMMAND = 3;

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    command: args[0] || "help",
    file: null,
    json: false,
    unknown: [],
  };

  for (let i = 1; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--file") {
      result.file = args[++i];
    } else if (arg === "--json") {
      result.json = true;
    } else {
      result.unknown.push(arg);
    }
  }

  return result;
}

function buildPlanPreview(intent) {
  return {
    action: intent.action,
    asset: intent.asset,
    amount: intent.amount,
    sender: intent.signer,
    recipient: intent.recipient,
    deadline: intent.deadline || null,
    previewOnly: true,
    note: "Offline preview only. No transaction has been constructed or executed.",
  };
}

function printHelp(stream = process.stdout) {
  stream.write(
    [
      "ChainRelay offline CLI",
      "",
      "Usage:",
      "  node scripts/chainrelay.js help",
      "  node scripts/chainrelay.js plan --file <path> [--json]",
      "  node scripts/chainrelay.js validate --file <path> [--json]",
      "  node scripts/chainrelay.js readiness --file <path> [--json]",
      "",
      "Commands:",
      "  help       Show this help text",
      "  plan       Preview an execution plan offline (no RPC/call construction)",
      "  validate   Validate a JSON intent file offline",
      "  readiness  Offline readiness report for a transaction intent",
      "",
      "No network, signing, or transaction submission is performed.",
      "",
    ].join("\n")
  );
}

function readIntentFile(options) {
  if (!options.file) {
    throw new Error("Missing required option: --file <path>");
  }

  let raw;
  try {
    raw = fs.readFileSync(options.file, "utf8");
  } catch (err) {
    throw new Error(`Unable to read file: ${options.file} (${err.message})`);
  }

  let intent;
  try {
    intent = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Malformed JSON in ${options.file}: ${err.message}`);
  }

  if (typeof intent !== "object" || intent === null || Array.isArray(intent)) {
    throw new Error("Intent file must contain a JSON object");
  }

  return intent;
}

function runValidate(options) {
  const intent = readIntentFile(options);
  const result = validateIntent(intent);

  if (options.json) {
    process.stdout.write(JSON.stringify(result) + "\n");
  } else if (result.valid) {
    process.stdout.write("Intent is valid.\n");
  } else {
    process.stdout.write("Intent is invalid:\n");
    for (const error of result.errors) {
      process.stdout.write(`- ${error}\n`);
    }
  }

  return result.valid ? EXIT_OK : EXIT_INVALID;
}

function runPlan(options) {
  const intent = readIntentFile(options);

  const validation = validateIntent(intent);
  if (!validation.valid) {
    if (options.json) {
      process.stdout.write(
        JSON.stringify({ valid: false, errors: validation.errors, preview: null }) +
          "\n"
      );
    } else {
      process.stderr.write("Intent is invalid:\n");
      for (const error of validation.errors) {
        process.stderr.write(`- ${error}\n`);
      }
    }
    return EXIT_INVALID;
  }

  const preview = buildPlanPreview(intent);

  if (options.json) {
    process.stdout.write(JSON.stringify({ valid: true, errors: [], preview }) + "\n");
  } else {
    process.stdout.write("Offline plan preview (no transaction constructed or executed):\n");
    process.stdout.write(`Action: ${preview.action}\n`);
    process.stdout.write(`Asset: ${preview.asset}\n`);
    process.stdout.write(`Amount: ${preview.amount}\n`);
    process.stdout.write(`Sender: ${preview.sender}\n`);
    process.stdout.write(`Recipient: ${preview.recipient}\n`);
    process.stdout.write(`${preview.note}\n`);
  }

  return EXIT_OK;
}

function runReadiness(options) {
  const intent = readIntentFile(options);
  const validation = validateIntent(intent);

  let amountStatus = "FAIL";
  let amountDetail = "Invalid amount.";
  try {
    const baseUnits = toBaseUnits(intent.amount, 14);
    if (baseUnits > 0n) {
      amountStatus = "PASS";
      amountDetail = "Amount format and value valid.";
    } else {
      amountDetail = "Amount must be greater than zero.";
    }
  } catch (err) {
    amountDetail = `Invalid amount: ${err.message}`;
  }

  const actionAssetStatus =
    Object.values(SUPPORTED_ACTIONS).includes(intent.action) &&
    Object.values(SUPPORTED_ASSETS).includes(intent.asset)
      ? "PASS"
      : "FAIL";

  let deadlineStatus = "PASS";
  let deadlineDetail = "No deadline provided.";
  if (intent.deadline) {
    if (intent.deadline <= Date.now()) {
      deadlineStatus = "FAIL";
      deadlineDetail = "Intent has expired (deadline must be in the future).";
    } else {
      deadlineDetail = "Deadline is in the future.";
    }
  }

  const checks = [
    { id: "intent_schema_action_asset", status: actionAssetStatus, detail: "Intent schema and supported action/asset." },
    { id: "amount", status: amountStatus, detail: amountDetail },
    { id: "recipient_address", status: (typeof intent.recipient === "string" && isValidSS58(intent.recipient)) ? "PASS" : "FAIL", detail: "Recipient SS58 address format." },
    { id: "signer_address", status: (typeof intent.signer === "string" && isValidSS58(intent.signer)) ? "PASS" : "FAIL", detail: "Signer SS58 address format." },
    { id: "deadline", status: deadlineStatus, detail: deadlineDetail },
    { id: "account_balances_known", status: "NEEDS_NETWORK", detail: "Account balances are not available offline." },
    { id: "fee_estimated", status: "NEEDS_NETWORK", detail: "Fee estimation requires network access." },
    { id: "simulation_performed", status: "NEEDS_NETWORK", detail: "Transaction simulation requires network access." },
    { id: "submission_or_confirmation_verified", status: "NEEDS_NETWORK", detail: "Submission and on-chain confirmation require network access." },
  ];

  const report = {
    valid: validation.valid,
    errors: validation.errors,
    checks,
    offline: true,
    noRpc: true,
    noSigning: true,
    noSubmission: true,
    noOnChainVerification: true,
    note: "Offline readiness report only. No RPC connection, signing, submission, or on-chain verification occurred. This does not guarantee execution success.",
  };

  if (options.json) {
    process.stdout.write(JSON.stringify(report) + "\n");
  } else {
    process.stdout.write("Offline readiness report (no RPC, signing, or submission):\n");
    for (const c of checks) {
      process.stdout.write(`${c.status.padEnd(14)} ${c.id}: ${c.detail}\n`);
    }
    if (!report.valid) {
      process.stdout.write("Intent is invalid:\n");
      for (const e of report.errors) {
        process.stdout.write(`- ${e}\n`);
      }
    }
    process.stdout.write(`${report.note}\n`);
  }

  return report.valid ? EXIT_OK : EXIT_INVALID;
}

function main(argv = process.argv) {
  const options = parseArgs(argv);

  try {
    switch (options.command) {
      case "help":
      case "--help":
      case "-h":
        printHelp();
        return EXIT_OK;

      case "validate":
        if (options.unknown.length > 0) {
          throw new Error(`Unsupported option: ${options.unknown.join(" ")}`);
        }
        return runValidate(options);

      case "plan":
        if (options.unknown.length > 0) {
          throw new Error(`Unsupported option: ${options.unknown.join(" ")}`);
        }
        return runPlan(options);

      case "readiness":
        if (options.unknown.length > 0) {
          throw new Error(`Unsupported option: ${options.unknown.join(" ")}`);
        }
        return runReadiness(options);

      default:
        throw new Error(`Unsupported command: ${options.command}`);
    }
  } catch (err) {
    if (options.json) {
      process.stdout.write(
        JSON.stringify({ valid: false, errors: [err.message] }) + "\n"
      );
    } else {
      process.stderr.write(`Error: ${err.message}\n`);
    }
    if (err.message.startsWith("Unsupported command")) {
      return EXIT_UNKNOWN_COMMAND;
    }
    return EXIT_USAGE;
  }
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  parseArgs,
  printHelp,
  runValidate,
  runPlan,
  runReadiness,
  main,
  EXIT_OK,
  EXIT_INVALID,
  EXIT_USAGE,
  EXIT_UNKNOWN_COMMAND,
};
