/**
 * Owner login setup, run on the server:
 *   npm run auth:setup            first-time setup (password + authenticator + recovery codes)
 *   npm run auth:setup -- --password   change the password only
 *   npm run auth:setup -- --recovery   issue a fresh set of recovery codes
 *   npm run auth:setup -- --signout    sign out every browser
 * Every change also signs out all existing sessions.
 */
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import QRCode from "qrcode";
import { AUTH_FILE, hashPassword, newRecoveryCodes, newTotpSecret, readAuth, revokeAllSessions, totpUri, verifyTotp, writeAuth } from "./auth.ts";

const args = new Set(process.argv.slice(2));

function ask(question: string, hidden = false): Promise<string> {
  let muted = false;
  const out = new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stdout.write(chunk);
      cb();
    },
  });
  const rl = createInterface({ input: process.stdin, output: out, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer);
    });
    muted = hidden;
  });
}

async function askPassword(): Promise<string> {
  for (;;) {
    const a = await ask("New password (at least 12 characters): ", true);
    if (a.length < 12) {
      console.log("  Too short. Use at least 12 characters; a passphrase of four or five words works well.");
      continue;
    }
    const b = await ask("Repeat the password: ", true);
    if (a !== b) {
      console.log("  The two didn't match. Try again.");
      continue;
    }
    return a;
  }
}

function printRecovery(codes: string[]) {
  console.log("\nRecovery codes. Each works once instead of an authenticator code. Store them somewhere safe:\n");
  for (const c of codes) console.log(`   ${c}`);
  console.log("");
}

async function main() {
  const existing = readAuth();

  if (args.has("--signout")) {
    revokeAllSessions();
    console.log("Signed out every browser.");
    return;
  }

  if (existing && args.has("--password")) {
    existing.passwordHash = hashPassword(await askPassword());
    writeAuth(existing);
    revokeAllSessions();
    console.log("Password changed. All browsers have been signed out.");
    return;
  }

  if (existing && args.has("--recovery")) {
    const { codes, hashes } = newRecoveryCodes();
    existing.recoveryHashes = hashes;
    writeAuth(existing);
    printRecovery(codes);
    console.log("The old recovery codes no longer work.");
    return;
  }

  if (existing && !args.has("--reset")) {
    console.log(`Login is already set up (${AUTH_FILE}).`);
    console.log("Use --password, --recovery or --signout, or --reset to start over with a new authenticator.");
    return;
  }

  console.log("Setting up the In-Tray login.\n");
  const passwordHash = hashPassword(await askPassword());
  const secret = newTotpSecret();
  const uri = totpUri(secret);
  console.log("\nScan this with your authenticator app (1Password, Google Authenticator, Authy…):\n");
  console.log(await QRCode.toString(uri, { type: "terminal", small: true }));
  console.log(`Or enter this key by hand: ${secret.match(/.{1,4}/g)!.join(" ")}\n`);

  for (;;) {
    const code = (await ask("Type the 6-digit code the app shows now, to confirm: ")).replace(/\s/g, "");
    const ok = verifyTotp(secret, code, 0) !== null;
    if (ok) break;
    console.log("  That code didn't match. Check the phone's clock is automatic and try the next code.");
  }

  const { codes, hashes } = newRecoveryCodes();
  writeAuth({ passwordHash, totpSecret: secret, recoveryHashes: hashes, lastTotpStep: 0, createdAt: new Date().toISOString() });
  revokeAllSessions();
  printRecovery(codes);
  console.log(`Saved to ${AUTH_FILE} (readable only by this user). Login is ready.`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
