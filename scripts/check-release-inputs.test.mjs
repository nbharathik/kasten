import assert from "node:assert/strict";
import { test } from "node:test";

import { missingInputs } from "./check-release-inputs.mjs";

// A public key as `tauri signer generate` writes it: the .pub file, in base64.
const PUBKEY = Buffer.from("untrusted comment: minisign public key: 1A2B3C4D5E6F7A8B\nRWQ0000000000000000000000000000000000000000000000000000\n").toString("base64");
const configWith = (pubkey) => ({ plugins: { updater: { pubkey } } });
const ready = { KASTEN_GITHUB_CLIENT_ID: "Ov23liExample" };

test("a release with the updater's public key and the client id is ready", () => {
  assert.deepEqual(missingInputs({ env: ready, config: configWith(PUBKEY) }), []);
});

test("names each missing input", () => {
  const missing = missingInputs({ env: {}, config: configWith("") });
  assert.equal(missing.length, 2);
  assert.match(missing[0], /pubkey/);
  assert.match(missing[1], /KASTEN_GITHUB_CLIENT_ID/);
  // The private key is the signing job's to check, never a build's.
  assert.ok(missing.every((item) => !/PRIVATE_KEY/.test(item)));
  assert.equal(missingInputs({ env: ready, config: {} }).length, 1);
});

test("refuses a public key that is not one", () => {
  const [problem] = missingInputs({ env: ready, config: configWith("bm90IGEga2V5") });
  assert.match(problem, /not a public key/);
});

test("the shipped config has no key yet, so only a dry run can build", () => {
  // The owner adds the public key before the first release; until then a
  // tag build stops here rather than shipping an app that can't update.
  assert.ok(missingInputs({ env: ready, config: configWith("") }).some((item) => /pubkey/.test(item)));
});
