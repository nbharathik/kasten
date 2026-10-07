import assert from "node:assert/strict";
import { test } from "node:test";

import { checkSignature, readPublicKey, signatureProblems, signedVersion } from "./check-signatures.mjs";

// Made with `tauri signer generate` and `tauri signer sign --app-version
// 0.1.0` for this test; the private half was thrown away.
const PUBLIC_KEY = Buffer.from(
  "untrusted comment: minisign public key: 7343E03D028DE2EB\nRWTr4o0CPeBDc45KC/1DRPXFzIQlf7XDlf0h+If1WUFhA1NrP7IH/Dye\n",
).toString("base64");
const FILE = Buffer.from("Kasten update file\n");
const SIG =
  "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVUcjRvMENQZUJEYzRzQ25kbTBSMFU5cytiQmdGZnNKakFCVCtUTFZpVWd4WWVEWVJHSVR5eHlSbVNURm9KU3ZpN3l0VWMwdTVYczgxVUlZYkt2eXZUV0Y3bjJNTTlWUmcwPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzkwNjAzNzkyCWZpbGU6S2FzdGVuXzAuMS4wX2FtZDY0LmRlYgl2ZXJzaW9uOjAuMS4wCkcwM1pmYmpxYnd6QUxEekVBQ0UxeGQrKzJvMWxVSW0rT2Judy9CcXIrczRGNW9NUTV2VE5FU0htUlpOczZ6UVJGYURCTi9PbFZLWVhxTlBvald0YkRRPT0K";

const key = readPublicKey(PUBLIC_KEY);
const text = (base64) => Buffer.from(base64, "base64").toString("utf8");
const base64 = (s) => Buffer.from(s).toString("base64");

test("reads the Tauri CLI's signature and the version it is bound to", () => {
  assert.equal(key.id, "7343E03D028DE2EB");
  const trusted = checkSignature({ data: FILE, sig: SIG, publicKey: key });
  assert.equal(trusted, "timestamp:1790603792\tfile:Kasten_0.1.0_amd64.deb\tversion:0.1.0");
  assert.equal(signedVersion(trusted), "0.1.0");
  assert.equal(signedVersion("timestamp:1\tfile:a.deb"), null);
});

test("refuses a changed file, a changed trusted comment and another key", () => {
  assert.throws(() => checkSignature({ data: Buffer.from("Kasten update file!\n"), sig: SIG, publicKey: key }), /does not match the file/);
  const moved = base64(text(SIG).replace("version:0.1.0", "version:0.2.0"));
  assert.throws(() => checkSignature({ data: FILE, sig: moved, publicKey: key }), /changed after signing/);
  // The same key bytes under another id stand for a key the app doesn't trust.
  const [comment, line] = text(PUBLIC_KEY).split("\n");
  const raw = Buffer.from(line, "base64");
  raw[2] ^= 0xff;
  const other = readPublicKey(base64(`${comment}\n${raw.toString("base64")}\n`));
  assert.throws(() => checkSignature({ data: FILE, sig: SIG, publicKey: other }), /but the app trusts key/);
  assert.throws(() => readPublicKey(base64("untrusted comment: nothing\nbm90IGEga2V5\n")), /not a minisign public key/);
});

test("names each update file whose signature would stop apps updating", () => {
  const files = {
    "Kasten_0.1.0_amd64.deb": FILE,
    "Kasten_0.1.0_amd64.deb.sig": Buffer.from(SIG),
    "Kasten-0.1.0-1.x86_64.rpm": Buffer.from("rpm"),
    "Kasten_0.1.0_x64.dmg": Buffer.from("not an update file"),
  };
  const read = (name) => files[name];
  const names = Object.keys(files);
  assert.deepEqual(signatureProblems({ names, read, version: "0.1.0", publicKey: key }), ["Kasten-0.1.0-1.x86_64.rpm: no signature"]);
  assert.deepEqual(signatureProblems({ names: names.slice(0, 2), read, version: "0.1.1", publicKey: key }), [
    "Kasten_0.1.0_amd64.deb: signed for version 0.1.0, not 0.1.1",
  ]);
  assert.deepEqual(signatureProblems({ names: ["Kasten_0.1.0_x64.dmg"], read, version: "0.1.0", publicKey: key }), ["no files installed apps update from"]);
});
