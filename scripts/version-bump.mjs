#!/usr/bin/env node

import { execSync } from "node:child_process";

const allowed = new Set(["major", "minor", "patch"]);
const args = process.argv.slice(2);

if (args.length > 1) {
  console.error("Usage: npm run version:bump -- [major|minor|patch]");
  process.exit(1);
}

const bumpType = args[0] ?? "patch";
if (!allowed.has(bumpType)) {
  console.error(`Invalid bump type \"${bumpType}\". Use major, minor, or patch.`);
  process.exit(1);
}

try {
  execSync(`npm version ${bumpType} --no-git-tag-version`, { stdio: "inherit" });
  execSync("node scripts/sync-version.mjs", { stdio: "inherit" });
  execSync("npm i", { stdio: "inherit" });
} catch {
  process.exit(1);
}
