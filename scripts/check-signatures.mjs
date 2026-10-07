// Checks the signature of each file installed apps update from, before a
// release goes out. Each must verify against the updater's public key, the
// one built into the app, and be bound to the release's version, which the
// app requires. A signing key that doesn't match the app's public key would
// leave every installed copy unable to update, so this runs before anything
// is published.
//
// The signatures are minisign's, as the Tauri CLI writes them: a .sig file
// holds, in base64, a comment line, the signature of the file's BLAKE2b-512
// hash, a trusted comment ("timestamp:…\tfile:…\tversion:…") and a
// signature over the first signature and that comment.
//
// Usage: node scripts/check-signatures.mjs <folder> <version> [public key]
// The public key is base64, as in tauri.conf.json; by default the app's own.

import { createHash, createPublicKey, verify } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { isUpdateFile } from "./update-files.mjs";

const lines = (base64) => Buffer.from(base64.trim(), "base64").toString("utf8").split(/\r?\n/);

/** A key id as minisign prints it: its 8 bytes backwards, in hex. */
const keyId = (bytes) => Buffer.from(bytes).reverse().toString("hex").toUpperCase();

/** The id and Ed25519 key in a public key as Tauri stores it. */
export function readPublicKey(base64) {
  const line = lines(base64).find((l) => l.trim() && !l.startsWith("untrusted comment:"));
  const raw = Buffer.from(line ?? "", "base64");
  if (raw.length !== 42 || raw.subarray(0, 2).toString("latin1") !== "Ed") {
    throw new Error("the updater's public key is not a minisign public key");
  }
  // An Ed25519 key in the DER form Node reads: a fixed prefix, then the key.
  const der = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), raw.subarray(10)]);
  return { id: keyId(raw.subarray(2, 10)), key: createPublicKey({ key: der, format: "der", type: "spki" }) };
}

/** The version a signature's trusted comment binds it to, if any. */
export function signedVersion(trusted) {
  return trusted.split("\t").find((field) => field.startsWith("version:"))?.slice("version:".length) ?? null;
}

/** Checks `sig` (a .sig file's text) over `data` with `publicKey`, and
 * returns its trusted comment; throws, saying why, when it doesn't hold. */
export function checkSignature({ data, sig, publicKey }) {
  const [, signatureLine, trustedLine, globalLine] = lines(sig);
  const raw = Buffer.from(signatureLine ?? "", "base64");
  if (raw.length !== 74) throw new Error("not a minisign signature");
  const algorithm = raw.subarray(0, 2).toString("latin1");
  const signature = raw.subarray(10);
  const id = keyId(raw.subarray(2, 10));
  if (id !== publicKey.id) throw new Error(`signed with key ${id}, but the app trusts key ${publicKey.id}`);
  // "ED" signs the file's hash, "Ed" (older) the file itself.
  const signed = algorithm === "ED" ? createHash("blake2b512").update(data).digest() : algorithm === "Ed" ? data : null;
  if (!signed) throw new Error(`unknown signature kind ${JSON.stringify(algorithm)}`);
  if (!verify(null, signed, publicKey.key, signature)) throw new Error("the signature does not match the file");
  const prefix = "trusted comment: ";
  if (!trustedLine?.startsWith(prefix)) throw new Error("the signature has no trusted comment");
  const trusted = trustedLine.slice(prefix.length);
  const global = Buffer.from(globalLine ?? "", "base64");
  if (!verify(null, Buffer.concat([signature, Buffer.from(trusted, "utf8")]), publicKey.key, global)) {
    throw new Error("the trusted comment was changed after signing");
  }
  return trusted;
}

/** Problems with the update files in `names`: each needs a signature that
 * `publicKey` verifies, bound to `version`. `read` gives a file's bytes. */
export function signatureProblems({ names, read, version, publicKey }) {
  const problems = [];
  const files = names.filter(isUpdateFile);
  if (!files.length) problems.push("no files installed apps update from");
  for (const file of files) {
    if (!names.includes(`${file}.sig`)) {
      problems.push(`${file}: no signature`);
      continue;
    }
    try {
      const trusted = checkSignature({ data: read(file), sig: read(`${file}.sig`).toString("utf8"), publicKey });
      const bound = signedVersion(trusted);
      if (bound !== version) problems.push(`${file}: signed for ${bound ? `version ${bound}` : "no version"}, not ${version}`);
    } catch (err) {
      problems.push(`${file}: ${err.message}`);
    }
  }
  return problems;
}

function main() {
  const [folder, version, key] = process.argv.slice(2);
  if (!folder || !version) {
    console.error("usage: check-signatures.mjs <folder> <version> [public key]");
    process.exit(2);
  }
  const pubkey = key ?? JSON.parse(readFileSync("app/src-tauri/tauri.conf.json", "utf8")).plugins?.updater?.pubkey ?? "";
  if (!pubkey.trim()) {
    console.error("The app has no updater public key yet: plugins.updater.pubkey in app/src-tauri/tauri.conf.json.");
    process.exit(1);
  }
  try {
    const publicKey = readPublicKey(pubkey);
    const names = readdirSync(folder);
    const problems = signatureProblems({ names, read: (name) => readFileSync(join(folder, name)), version, publicKey });
    if (problems.length) throw new Error(`These signatures would not let apps update:\n- ${problems.join("\n- ")}`);
    console.log(`Every update file is signed for ${version} with key ${publicKey.id}.`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
