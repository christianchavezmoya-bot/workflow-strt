import { describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — Node build scripts are plain ESM without TS declarations.
import { analyzeArtifact } from "../../scripts/lib/artifact-isolation.mjs";
// @ts-expect-error — Node build scripts are plain ESM without TS declarations.
import { validateApiBaseForProfile, resolveProfile } from "../../scripts/build-profiles.mjs";

const FIXTURE_ROOT = join(process.cwd(), ".tmp-artifact-fixtures");

interface FixtureManifest {
  profile: string;
  appEnv: string;
  apiBase: string;
  debugFeaturesEnabled: boolean;
}

function writeFixture(profile: string, opts: { jsContent: string; manifest: FixtureManifest }) {
  const { jsContent, manifest } = opts;
  const dir = join(FIXTURE_ROOT, profile);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "assets"), { recursive: true });
  writeFileSync(join(dir, "assets", "index-fixture.js"), jsContent);
  writeFileSync(join(dir, "build-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return dir;
}

describe("artifact isolation", () => {
  it("passes a valid PROD fixture", () => {
    const dir = writeFixture("prod-ok", {
      jsContent: 'const env="prod"; const api="https://api.strata-ngo.com/api"; function isDebugFeaturesEnabled(){return false}',
      manifest: {
        profile: "prod",
        appEnv: "prod",
        apiBase: "https://api.strata-ngo.com/api",
        debugFeaturesEnabled: false,
      },
    });
    const result = analyzeArtifact(dir, "prod");
    expect(result.pass).toBe(true);
  });

  it("fails PROD fixture with staging API baked in", () => {
    const dir = writeFixture("prod-bad-staging", {
      jsContent: 'const api="https://api.staging.strata-ngo.com/api"; const env="prod"',
      manifest: {
        profile: "prod",
        appEnv: "prod",
        apiBase: "https://api.staging.strata-ngo.com/api",
        debugFeaturesEnabled: false,
      },
    });
    const result = analyzeArtifact(dir, "prod");
    expect(result.pass).toBe(false);
    expect(result.violations.some((v: string) => v.includes("staging"))).toBe(true);
  });

  it("passes a valid DEV fixture", () => {
    const dir = writeFixture("dev-ok", {
      jsContent: 'const env="dev"; const api="https://api.staging.strata-ngo.com/api"; function isDebugFeaturesEnabled(){return true}',
      manifest: {
        profile: "dev",
        appEnv: "dev",
        apiBase: "https://api.staging.strata-ngo.com/api",
        debugFeaturesEnabled: true,
      },
    });
    const result = analyzeArtifact(dir, "dev");
    expect(result.pass).toBe(true);
  });
});

describe("build profile API validation", () => {
  it("rejects staging API for prod profile", () => {
    expect(() =>
      validateApiBaseForProfile("https://api.staging.strata-ngo.com/api", resolveProfile("prod")),
    ).toThrow(/staging/i);
  });

  it("accepts staging API for dev profile", () => {
    expect(
      validateApiBaseForProfile("https://api.staging.strata-ngo.com/api", resolveProfile("dev")),
    ).toBe("https://api.staging.strata-ngo.com/api");
  });
});
