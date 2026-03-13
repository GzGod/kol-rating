import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("build script does not require database connectivity", async () => {
  const raw = await readFile(new URL("../package.json", import.meta.url), "utf8");
  const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };

  assert.ok(pkg.scripts?.build, "build script should exist");
  assert.equal(
    pkg.scripts?.build?.includes("prisma db push"),
    false,
    "build must not run prisma db push"
  );
});
