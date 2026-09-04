#!/usr/bin/env node
import { randomBytes } from "node:crypto";

/**
 * Print a fresh 32-byte key (64 hex chars) for SLEEPBOT_SECRET_KEY — the key
 * that encrypts UI-editable secrets at rest (dec.ui-config-editing):
 *
 *   npm run gen-secret-key
 *
 * Store the output as a Secret Manager secret; it is a bootstrap value, never
 * editable from the UI. Rotating it makes previously stored secrets undecryptable.
 */
process.stdout.write(randomBytes(32).toString("hex") + "\n");
