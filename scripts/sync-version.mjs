#!/usr/bin/env node
// Syncs the version from package.json into src-tauri/tauri.conf.json and
// src-tauri/Cargo.toml (+ Cargo.lock), so release builds aren't misversioned.
// Invoked automatically by `npm version` via the "version" script hook.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const pkg = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8"));
const version = pkg.version;

const tauriConfPath = path.join(rootDir, "src-tauri", "tauri.conf.json");
const tauriConf = JSON.parse(readFileSync(tauriConfPath, "utf8"));
tauriConf.version = version;
writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + "\n");

const cargoTomlPath = path.join(rootDir, "src-tauri", "Cargo.toml");
const cargoToml = readFileSync(cargoTomlPath, "utf8");
const updatedCargoToml = cargoToml.replace(
  /^version = ".*"$/m,
  `version = "${version}"`,
);
writeFileSync(cargoTomlPath, updatedCargoToml);

const cargoLockPath = path.join(rootDir, "src-tauri", "Cargo.lock");
const cargoLock = readFileSync(cargoLockPath, "utf8");
const updatedCargoLock = cargoLock.replace(
  /(name = "thicket"\nversion = ").*(")/,
  `$1${version}$2`,
);
writeFileSync(cargoLockPath, updatedCargoLock);

console.log(`Synced version ${version} to tauri.conf.json, Cargo.toml, Cargo.lock`);
