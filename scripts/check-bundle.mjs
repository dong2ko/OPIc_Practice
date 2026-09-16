import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const forbidden = [
  /service_role/i,
  /postgres(?:ql)?:\/\//i,
  /sk-[a-z0-9_-]{16,}/i,
  /OPIc_SMART_Personalized_Study_Guide/i,
  /Daniel\s*[·|]/i,
];

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  }))).flat();
}

const files = (await filesUnder("dist")).filter((path) => [".html", ".js", ".css", ".json"].includes(extname(path)));
const failures = [];
for (const path of files) {
  const content = await readFile(path, "utf8");
  for (const pattern of forbidden) if (pattern.test(content)) failures.push(`${path}: ${pattern}`);
}
if (failures.length) {
  console.error("Production bundle contains forbidden private or secret-like content:\n" + failures.join("\n"));
  process.exit(1);
}
console.log(`Bundle check passed for ${files.length} text assets.`);
