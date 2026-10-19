const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CLI = path.join(__dirname, "..", "scripts", "chainrelay.js");

function runCli(args, options = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    ...options,
  });
}

test("help command exits 0", () => {
  const result = runCli(["help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /ChainRelay offline CLI/);
});

test("unknown command exits 3", () => {
  const result = runCli(["frobnicate"]);
  assert.equal(result.status, 3);
});

test("validate missing --file exits non-zero", () => {
  const result = runCli(["validate"]);
  assert.notEqual(result.status, 0);
});

test("validate missing file exits 2", () => {
  const result = runCli(["validate", "--file", path.join(os.tmpdir(), "nope.json")]);
  assert.equal(result.status, 2);
});

test("validate malformed JSON exits 2", () => {
  const file = path.join(os.tmpdir(), "bad.json");
  fs.writeFileSync(file, "{not json");
  const result = runCli(["validate", "--file", file, "--json"]);
  assert.equal(result.status, 2);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.valid, false);
});

test("validate valid offline intent exits 0", () => {
  const file = path.join(os.tmpdir(), "good.json");
  const intent = {
    action: "transfer",
    asset: "POT",
    amount: "1.5",
    recipient: "5CShbTqxKUgKZBRDu1VGVpivm3m415stz86A5GBdoV7wrU1d",
    signer: "5H728gLgx4yuCSVEwGCAfLo3RtzTau9F6cTNqNJtrqqjACWq",
  };
  fs.writeFileSync(file, JSON.stringify(intent));
  const result = runCli(["validate", "--file", file]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Intent is valid/);
});

test("plan valid exits 0 with preview", () => {
  const file = path.join(os.tmpdir(), "plan-good.json");
  const intent = {
    action: "transferKeepAlive",
    asset: "POT",
    amount: "2",
    recipient: "5CShbTqxKUgKZBRDu1VGVpivm3m415stz86A5GBdoV7wrU1d",
    signer: "5H728gLgx4yuCSVEwGCAfLo3RtzTau9F6cTNqNJtrqqjACWq",
  };
  fs.writeFileSync(file, JSON.stringify(intent));
  const result = runCli(["plan", "--file", file]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Offline plan preview/);
  assert.match(result.stdout, /Action: transferKeepAlive/);
  assert.match(result.stdout, /no transaction constructed or executed/);
});

test("plan --json valid outputs preview fields", () => {
  const file = path.join(os.tmpdir(), "plan-json.json");
  const intent = {
    action: "transferAll",
    asset: "POT",
    amount: "1",
    recipient: "5CShbTqxKUgKZBRDu1VGVpivm3m415stz86A5GBdoV7wrU1d",
    signer: "5H728gLgx4yuCSVEwGCAfLo3RtzTau9F6cTNqNJtrqqjACWq",
  };
  fs.writeFileSync(file, JSON.stringify(intent));
  const result = runCli(["plan", "--file", file, "--json"]);
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.preview.action, "transferAll");
  assert.equal(parsed.preview.previewOnly, true);
});

test("plan invalid intent exits 1", () => {
  const file = path.join(os.tmpdir(), "plan-invalid.json");
  fs.writeFileSync(file, JSON.stringify({ action: "nope" }));
  const result = runCli(["plan", "--file", file, "--json"]);
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.valid, false);
});

test("plan missing file exits 2", () => {
  const result = runCli(["plan", "--file", path.join(os.tmpdir(), "nope2.json")]);
  assert.equal(result.status, 2);
});

test("plan malformed JSON exits 2", () => {
  const file = path.join(os.tmpdir(), "plan-bad.json");
  fs.writeFileSync(file, "{bad");
  const result = runCli(["plan", "--file", file, "--json"]);
  assert.equal(result.status, 2);
});

test("readiness valid intent exits 0 with offline report", () => {
  const file = path.join(os.tmpdir(), "ready-good.json");
  const intent = {
    action: "transfer",
    asset: "POT",
    amount: "1.5",
    recipient: "5CShbTqxKUgKZBRDu1VGVpivm3m415stz86A5GBdoV7wrU1d",
    signer: "5H728gLgx4yuCSVEwGCAfLo3RtzTau9F6cTNqNJtrqqjACWq",
  };
  fs.writeFileSync(file, JSON.stringify(intent));
  const result = runCli(["readiness", "--file", file]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Offline readiness report/);
  assert.match(result.stdout, /no RPC, signing, or submission/i);
});

test("readiness invalid intent exits 1", () => {
  const file = path.join(os.tmpdir(), "ready-invalid.json");
  fs.writeFileSync(file, JSON.stringify({ action: "nope", asset: "POT", amount: "0", recipient: "bad", signer: "5H728gLgx4yuCSVEwGCAfLo3RtzTau9F6cTNqNJtrqqjACWq" }));
  const result = runCli(["readiness", "--file", file]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Intent is invalid/);
});

test("readiness missing file exits 2", () => {
  const result = runCli(["readiness", "--file", path.join(os.tmpdir(), "nope-ready.json")]);
  assert.equal(result.status, 2);
});

test("readiness malformed JSON exits 2", () => {
  const file = path.join(os.tmpdir(), "ready-bad.json");
  fs.writeFileSync(file, "{bad");
  const result = runCli(["readiness", "--file", file, "--json"]);
  assert.equal(result.status, 2);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.valid, false);
});

test("readiness --json reports NEEDS_NETWORK for unverified items", () => {
  const file = path.join(os.tmpdir(), "ready-json.json");
  const intent = {
    action: "transferKeepAlive",
    asset: "POT",
    amount: "2",
    recipient: "5CShbTqxKUgKZBRDu1VGVpivm3m415stz86A5GBdoV7wrU1d",
    signer: "5H728gLgx4yuCSVEwGCAfLo3RtzTau9F6cTNqNJtrqqjACWq",
  };
  fs.writeFileSync(file, JSON.stringify(intent));
  const result = runCli(["readiness", "--file", file, "--json"]);
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.offline, true);
  assert.equal(parsed.noRpc, true);
  assert.equal(parsed.noSigning, true);
  assert.equal(parsed.noSubmission, true);
  assert.equal(parsed.noOnChainVerification, true);
  const networkChecks = parsed.checks.filter((c) => c.status === "NEEDS_NETWORK");
  assert.equal(networkChecks.length, 4);
});

test("readiness unsupported asset exits 1", () => {
  const file = path.join(os.tmpdir(), "ready-asset.json");
  const intent = {
    action: "transfer",
    asset: "BTC",
    amount: "1",
    recipient: "5CShbTqxKUgKZBRDu1VGVpivm3m415stz86A5GBdoV7wrU1d",
    signer: "5H728gLgx4yuCSVEwGCAfLo3RtzTau9F6cTNqNJtrqqjACWq",
  };
  fs.writeFileSync(file, JSON.stringify(intent));
  const result = runCli(["readiness", "--file", file, "--json"]);
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.valid, false);
});

test("readiness does not invoke rpc or signing", () => {
  const file = path.join(os.tmpdir(), "ready-no-rpc.json");
  const intent = {
    action: "transfer",
    asset: "POT",
    amount: "1",
    recipient: "5CShbTqxKUgKZBRDu1VGVpivm3m415stz86A5GBdoV7wrU1d",
    signer: "5H728gLgx4yuCSVEwGCAfLo3RtzTau9F6cTNqNJtrqqjACWq",
  };
  fs.writeFileSync(file, JSON.stringify(intent));
  const result = runCli(["readiness", "--file", file]);
  assert.equal(result.status, 0);
});
