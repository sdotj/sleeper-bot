#!/usr/bin/env node
import { createInterface } from "node:readline";
import { hashPassword } from "./credentials.js";

/**
 * CLI to turn a plaintext password into the scrypt hash stored in
 * SLEEPBOT_AUTH_PASSWORD_HASH (dec.api-auth-gate). Reads the password from the
 * first CLI arg, or prompts on stdin so it never lands in your shell history:
 *
 *   npm run hash-password -- 'my-password'
 *   npm run hash-password            # then type it at the prompt
 */
async function main(): Promise<void> {
  const fromArg = process.argv[2];
  const password = fromArg ?? (await prompt("Password: "));
  if (!password) {
    console.error("No password provided.");
    process.exit(1);
  }
  process.stdout.write(hashPassword(password) + "\n");
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => rl.question(question, (a) => (rl.close(), resolve(a.trim()))));
}

void main();
