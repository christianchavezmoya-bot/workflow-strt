/**
 * Proves scripts/sync-ocr-assets.mjs actually produces the cross-platform-safe layout, by
 * running the real script against the real installed node_modules packages (not a mock) and
 * inspecting its real output on disk.
 *
 * The central regression this guards: Android's AAPT2 build tool silently gunzips any `assets/`
 * file ending in `.gz` and strips the extension while packaging the APK (confirmed against a
 * real built APK) — so shipping `eng.traineddata.gz` broke first-use offline OCR on Android only.
 * The fix ships one uncompressed `eng.traineddata` on every platform; these tests make sure that
 * never silently regresses back to a `.gz` file.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// vitest runs with the repo root as cwd, and this suite must exercise the REAL script against the
// REAL installed node_modules — cwd-relative paths sidestep import.meta.url resolution quirks
// under vitest's .mjs module transform, which does not always yield a real file:// URL.
const repoRoot = process.cwd();
const require = createRequire(join(repoRoot, "package.json"));
const scriptPath = join(repoRoot, "scripts", "sync-ocr-assets.mjs");
const outDir = join(repoRoot, "public", "tesseract");
const langDir = join(outDir, "lang");

// The script always writes to <repo>/public/tesseract — there's no output-dir flag, so these
// tests run it for real against that fixed location. To avoid disturbing whatever a developer or
// another build step already has there, the existing directory (if any) is snapshotted and
// restored afterwards rather than assumed empty.
const preExistingBackup = mkdtempSync(join(tmpdir(), "sync-ocr-assets-backup-"));
let hadPreExisting = false;

beforeAll(() => {
  if (existsSync(outDir)) {
    hadPreExisting = true;
    execFileSync("cp", ["-R", outDir, join(preExistingBackup, "tesseract")]);
  }
  execFileSync("node", [scriptPath, "--clean"], { cwd: repoRoot });
  execFileSync("node", [scriptPath], { cwd: repoRoot, stdio: "pipe" });
});

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true });
  if (hadPreExisting) {
    execFileSync("cp", ["-R", join(preExistingBackup, "tesseract"), outDir]);
  }
  rmSync(preExistingBackup, { recursive: true, force: true });
});

describe("sync-ocr-assets.mjs generates the uncompressed, cross-platform language model", () => {
  it("writes eng.traineddata (uncompressed), not eng.traineddata.gz", () => {
    expect(existsSync(join(langDir, "eng.traineddata"))).toBe(true);
    expect(existsSync(join(langDir, "eng.traineddata.gz"))).toBe(false);
  });

  it("writes no .gz file anywhere under public/tesseract/", () => {
    const walk = (dir) =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name);
        return entry.isDirectory() ? walk(full) : [full];
      });
    const allFiles = walk(outDir);
    const gzFiles = allFiles.filter((f) => f.endsWith(".gz"));
    expect(gzFiles).toEqual([]);
  });

  it("the generated model's bytes exactly equal the gunzipped npm-published source", () => {
    const sourceGz = readFileSync(
      require.resolve("@tesseract.js-data/eng/package.json").replace(
        "package.json",
        "4.0.0_best_int/eng.traineddata.gz",
      ),
    );
    const expected = gunzipSync(sourceGz);
    const generated = readFileSync(join(langDir, "eng.traineddata"));
    expect(generated.equals(expected)).toBe(true);
  });

  it("generation is deterministic: running it twice produces byte-identical output", () => {
    const first = readFileSync(join(langDir, "eng.traineddata"));
    execFileSync("node", [scriptPath], { cwd: repoRoot, stdio: "pipe" });
    const second = readFileSync(join(langDir, "eng.traineddata"));
    expect(second.equals(first)).toBe(true);
  });

  it("still writes the worker and both WASM core builds, self-hosted and byte-identical to their npm sources", () => {
    const workerSource = require.resolve("tesseract.js/package.json").replace("package.json", "dist/worker.min.js");
    const coreLstmSource = require
      .resolve("tesseract.js-core/package.json")
      .replace("package.json", "tesseract-core-lstm.wasm.js");
    const coreSimdSource = require
      .resolve("tesseract.js-core/package.json")
      .replace("package.json", "tesseract-core-simd-lstm.wasm.js");

    expect(readFileSync(join(outDir, "worker.min.js")).equals(readFileSync(workerSource))).toBe(true);
    expect(
      readFileSync(join(outDir, "tesseract-core-lstm.wasm.js")).equals(readFileSync(coreLstmSource)),
    ).toBe(true);
    expect(
      readFileSync(join(outDir, "tesseract-core-simd-lstm.wasm.js")).equals(readFileSync(coreSimdSource)),
    ).toBe(true);
  });

  it("nothing in the generated output references jsDelivr or unpkg", () => {
    const walk = (dir) =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name);
        return entry.isDirectory() ? walk(full) : [full];
      });
    for (const file of walk(outDir)) {
      if (file.endsWith(".wasm.js") || file.endsWith("worker.min.js")) {
        // These are third-party files that contain their OWN unused default CDN URLs (dead code
        // — our runtime always overrides workerPath/corePath/langPath). Only the language model,
        // which we generate ourselves, must be free of any such string.
        continue;
      }
      const contents = readFileSync(file, "latin1");
      expect(contents).not.toContain("jsdelivr");
      expect(contents).not.toContain("unpkg");
    }
  });

  it("removes a stale eng.traineddata.gz left behind by an older version of this script", () => {
    const staleGz = join(langDir, "eng.traineddata.gz");
    // Simulate exactly what happened in practice: an old run wrote the compressed file, then a
    // newer version of the script (which no longer writes it) ran on top without cleaning it up.
    execFileSync("cp", [require.resolve("@tesseract.js-data/eng/package.json").replace(
      "package.json", "4.0.0_best_int/eng.traineddata.gz",
    ), staleGz]);
    expect(existsSync(staleGz)).toBe(true);

    execFileSync("node", [scriptPath], { cwd: repoRoot, stdio: "pipe" });

    expect(existsSync(staleGz)).toBe(false);
    expect(existsSync(join(langDir, "eng.traineddata"))).toBe(true);
  });

  it("--clean removes the whole generated directory", () => {
    expect(existsSync(outDir)).toBe(true);
    execFileSync("node", [scriptPath, "--clean"], { cwd: repoRoot });
    expect(existsSync(outDir)).toBe(false);
    // Restore it so later tests in this file (and any other suite relying on public/tesseract/
    // existing, such as a subsequent `npm run build`) aren't left without it.
    execFileSync("node", [scriptPath], { cwd: repoRoot, stdio: "pipe" });
  });
});
