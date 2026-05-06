// Maps the current git branch to a stable port:
//   main             -> 3000
//   anything else    -> 3100..3999 (sha1(branch) % 900 + 3100)
// Prints the port to stdout so it can be inlined: PORT=$(node ...) npm run dev

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const branch = execSync("git rev-parse --abbrev-ref HEAD").toString().trim();

if (branch === "main") {
  process.stdout.write("3000");
} else {
  const h = createHash("sha1").update(branch).digest();
  const offset = ((h[0] << 8) | h[1]) % 900;
  process.stdout.write(String(3100 + offset));
}
