const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("path");

const DOCTOR_SCRIPT = path.resolve(__dirname, "../scripts/doctor.js");

function runDoctor(env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [DOCTOR_SCRIPT], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });

    child.on("error", (err) => {
      resolve({ code: -1, stdout, stderr: err.message });
    });
  });
}

test("doctor exits with error when PORTALDOT_WS_URL is not set", async () => {
  const result = await runDoctor({ PORTALDOT_WS_URL: undefined });
  assert.strictEqual(result.code, 1);
  assert.ok(result.stderr.includes("PORTALDOT_WS_URL environment variable is not set"));
  assert.ok(result.stderr.includes("Usage:"));
  assert.ok(result.stderr.includes("mainnet.portaldot.io"));
  assert.ok(result.stderr.includes("local development node"));
  assert.ok(result.stderr.includes("hackathon testnet verification"));
});

test("doctor exits with error when PORTALDOT_WS_URL is empty", async () => {
  const result = await runDoctor({ PORTALDOT_WS_URL: "" });
  assert.strictEqual(result.code, 1);
  assert.ok(result.stderr.includes("PORTALDOT_WS_URL environment variable is not set"));
});

test("doctor exits with error when PORTALDOT_WS_URL is whitespace", async () => {
  const result = await runDoctor({ PORTALDOT_WS_URL: "   " });
  assert.strictEqual(result.code, 1);
  assert.ok(result.stderr.includes("PORTALDOT_WS_URL environment variable is not set"));
});

test("doctor shows help text with usage examples", async () => {
  const result = await runDoctor({ PORTALDOT_WS_URL: undefined });
  assert.ok(result.stderr.includes("PORTALDOT_WS_URL=wss://your-endpoint npm run doctor"));
  assert.ok(result.stderr.includes("PORTALDOT_WS_URL=wss://mainnet.portaldot.io npm run doctor"));
  assert.ok(result.stderr.includes("PORTALDOT_WS_URL=ws://127.0.0.1:9944 npm run doctor"));
  assert.ok(result.stderr.includes("organizer confirmation"));
});

// We can't easily test the formatting functions without importing them,
// but we can verify the script loads without syntax errors by checking
// that it shows the config error quickly (before any connection attempt)
test("doctor script loads without syntax errors", async () => {
  const result = await runDoctor({ PORTALDOT_WS_URL: undefined });
  // Should fail at config check, not at script loading
  assert.strictEqual(result.code, 1);
  assert.ok(result.stderr.includes("PORTALDOT_WS_URL environment variable is not set"));
});