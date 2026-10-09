import { randomBytes, scrypt } from "node:crypto";
import readline from "node:readline";
async function readPassword() {
  if (!process.stdin.isTTY) {
    let value = "";
    for await (const chunk of process.stdin) value += chunk;
    return value.replace(/\r?\n$/, "");
  }
  process.stderr.write("Administrator password (14 to 256 characters; input is hidden): ");
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  return new Promise((resolve) => {
    let value = "";
    const listener = (character, key) => {
      if (key?.ctrl && key.name === "c") { process.stdin.setRawMode(false); process.exit(130); }
      if (key?.name === "return") {
        process.stdin.off("keypress", listener); process.stdin.setRawMode(false); process.stdin.pause();
        process.stderr.write("\n"); resolve(value);
      } else if (key?.name === "backspace") value = value.slice(0, -1);
      else if (character && !key?.ctrl && !key?.meta) value += character;
    };
    process.stdin.on("keypress", listener);
  });
}
const password = await readPassword();
if (password.length < 14 || password.length > 256) throw new Error("Use 14 to 256 characters.");
const salt = randomBytes(16).toString("hex");
const derived = await new Promise((resolve, reject) => scrypt(password, salt, 64,
  { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, bytes) => error ? reject(error) : resolve(bytes)));
console.log(`scrypt$${salt}$${derived.toString("hex")}`);
