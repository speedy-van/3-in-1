import { readFileSync, writeFileSync } from "node:fs";
const manifest = JSON.parse(readFileSync("package.json", "utf8"));
for (const section of ["dependencies", "devDependencies"]) {
  for (const name of Object.keys(manifest[section] ?? {})) {
    const installed = JSON.parse(readFileSync(`node_modules/${name}/package.json`, "utf8"));
    if (!/^\d+\.\d+\.\d+/.test(installed.version)) throw new Error(`Unexpected installed version for ${name}`);
    manifest[section][name] = installed.version;
  }
}
writeFileSync("package.json", `${JSON.stringify(manifest, null, 2)}\n`);
