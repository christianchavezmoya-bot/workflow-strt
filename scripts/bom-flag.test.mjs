import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  BOM_ARTIFACT_MARKERS,
  BOM_FLAG_ENV,
  BUILD_PROFILES,
  resolveBomModuleFlag,
} from "./build-profiles.mjs";
import { analyzeArtifact, analyzeBomModule, detectBomModule } from "./lib/artifact-isolation.mjs";

const root = resolve(import.meta.dirname, "..");
const { prod, dev } = BUILD_PROFILES;

describe("profile BOM declarations", () => {
  it("every profile explicitly declares features.bomModule", () => {
    for (const profile of Object.values(BUILD_PROFILES)) {
      expect(typeof profile.features?.bomModule, `${profile.id}.features.bomModule`).toBe("boolean");
    }
  });

  it("production ships BOM (matches the production backend ENABLE_BOM_PROJECT_MODULE=true)", () => {
    expect(prod.features.bomModule).toBe(true);
  });

  it("staging/dev intentionally includes BOM, as every staging env example does", () => {
    expect(dev.features.bomModule).toBe(true);
  });
});

describe("resolveBomModuleFlag", () => {
  it("prod is enabled with NO env value (clean checkout, no .env files)", () => {
    expect(resolveBomModuleFlag(prod, undefined)).toEqual({
      enabled: true,
      source: "profile-pin",
      ignoredEnvValue: null,
    });
  });

  it("prod is pinned: env files / shell can neither disable nor otherwise change it", () => {
    for (const ambient of ["false", "0", "", "TRUE", "yes"]) {
      const r = resolveBomModuleFlag(prod, ambient);
      expect(r.enabled, `ambient=${JSON.stringify(ambient)}`).toBe(true);
      expect(r.source).toBe("profile-pin");
    }
    expect(resolveBomModuleFlag(prod, "false").ignoredEnvValue).toBe("false");
    expect(resolveBomModuleFlag(prod, "true").ignoredEnvValue).toBeNull();
  });

  it("dev defaults to the profile value but honours an explicit true/false", () => {
    expect(resolveBomModuleFlag(dev, undefined)).toMatchObject({ enabled: true, source: "profile-default" });
    expect(resolveBomModuleFlag(dev, "false")).toMatchObject({ enabled: false, source: "env" });
    expect(resolveBomModuleFlag(dev, "true")).toMatchObject({ enabled: true, source: "env" });
    // junk is ignored, not treated as false
    expect(resolveBomModuleFlag(dev, "nope")).toMatchObject({ enabled: true, source: "profile-default" });
  });

  it("rejects a profile that does not declare the flag", () => {
    expect(() => resolveBomModuleFlag({ id: "prod" }, undefined)).toThrow(/features\.bomModule/);
  });
});

describe("artifact markers stay in sync with the source", () => {
  // If either assertion fails, the BOM marker in scripts/build-profiles.mjs must be updated —
  // otherwise the production BOM guard would silently stop detecting the module.
  const src = (rel) => readFileSync(join(root, rel), "utf8");

  it("Sidebar still gates its BOM entry with the tourKey marker", () => {
    const sidebar = src("src/components/layout/Sidebar.tsx");
    expect(sidebar).toContain(`BOM_MODULE_ENABLED ? [{ label: "BOM to Project"`);
    expect(sidebar).toContain(`tourKey: ${BOM_ARTIFACT_MARKERS.sidebar}`);
  });

  it("routes still gate the import-wizard paths behind BOM_MODULE_ENABLED", () => {
    const routes = src("src/app/routes.tsx");
    expect(routes).toContain("{BOM_MODULE_ENABLED && (");
    expect(routes).toContain(`path=${BOM_ARTIFACT_MARKERS.routes}`);
  });

  it("the flag env name matches what the frontend reads", () => {
    expect(src("src/modules/bom-project/featureFlag.ts")).toContain(`import.meta.env.${BOM_FLAG_ENV}`);
  });
});

describe("artifact BOM assertion (synthetic dist fixtures)", () => {
  const dirs = [];
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
  });

  const WITH_BOM = `${BOM_ARTIFACT_MARKERS.sidebar};${BOM_ARTIFACT_MARKERS.routes};`;
  // BOM code that ships in EVERY build (unreachable when the flag is off) — must not count as "enabled".
  const ALWAYS_PRESENT = `"BOM to Project";"/admin/bom-project/upload";`;

  function makeDist({ chunk, manifestFeatures, profile = prod }) {
    const dist = mkdtempSync(join(tmpdir(), "bom-dist-"));
    dirs.push(dist);
    mkdirSync(join(dist, "assets"));
    const envMarker = profile.id === "prod" ? '"prod"' : '"dev"';
    const api = profile.id === "prod" ? "https://api.strata-ngo.com/api" : "https://api.staging.strata-ngo.com/api";
    writeFileSync(join(dist, "assets", "index-abc.js"), `${envMarker};"${api}";${chunk}`);
    writeFileSync(
      join(dist, "build-manifest.json"),
      JSON.stringify({
        profile: profile.id,
        appEnv: profile.appEnv,
        apiBase: api,
        debugFeaturesEnabled: profile.debugFeaturesEnabled,
        ...(manifestFeatures ? { features: manifestFeatures } : {}),
      }),
    );
    return dist;
  }

  it("detects BOM only when BOTH gated markers are present", () => {
    expect(detectBomModule(WITH_BOM)).toMatchObject({ enabled: true, inconsistent: false });
    expect(detectBomModule(ALWAYS_PRESENT)).toMatchObject({ enabled: false, inconsistent: false });
    expect(detectBomModule(`${BOM_ARTIFACT_MARKERS.sidebar};`)).toMatchObject({ enabled: false, inconsistent: true });
  });

  it("a prod artifact WITH the BOM markers passes every check", () => {
    const dist = makeDist({ chunk: WITH_BOM + ALWAYS_PRESENT, manifestFeatures: { bomModule: true } });
    const result = analyzeArtifact(dist, "prod");
    expect(result.violations).toEqual([]);
    expect(result.pass).toBe(true);
    expect(result.checks).toContainEqual({ id: "bom-module", pass: true });
    expect(analyzeBomModule(dist, "prod").pass).toBe(true);
  });

  it("a prod artifact WITHOUT BOM fails — even though BOM code is bundled but unreachable", () => {
    const dist = makeDist({ chunk: ALWAYS_PRESENT });
    const result = analyzeArtifact(dist, "prod");
    expect(result.pass).toBe(false);
    expect(result.checks).toContainEqual({ id: "bom-module", pass: false });
    expect(result.violations.join("\n")).toMatch(/BOM module DISABLED .* requires enabled/);
    expect(analyzeBomModule(dist, "prod").pass).toBe(false);
  });

  it("a prod artifact with a half-present module fails as inconsistent", () => {
    const dist = makeDist({ chunk: `${BOM_ARTIFACT_MARKERS.routes};` });
    expect(analyzeArtifact(dist, "prod").violations.join("\n")).toMatch(/inconsistent/);
  });

  it("a manifest that claims BOM but the bundle lacks it is flagged, and vice versa", () => {
    const claimsButMissing = analyzeArtifact(makeDist({ chunk: ALWAYS_PRESENT, manifestFeatures: { bomModule: true } }), "prod");
    expect(claimsButMissing.violations.join("\n")).toMatch(/features\.bomModule=true but artifact has BOM disabled/);
  });

  it("prod ignores a manifest that claims BOM is off — the profile pin wins", () => {
    const dist = makeDist({ chunk: ALWAYS_PRESENT, manifestFeatures: { bomModule: false } });
    expect(analyzeArtifact(dist, "prod").checks).toContainEqual({ id: "bom-module", pass: false });
  });

  it("dev artifacts: default expects BOM, an explicit override is honoured via the manifest", () => {
    const enabled = makeDist({ chunk: WITH_BOM, profile: dev });
    expect(analyzeArtifact(enabled, "dev").checks).toContainEqual({ id: "bom-module", pass: true });

    const overriddenOff = makeDist({ chunk: ALWAYS_PRESENT, manifestFeatures: { bomModule: false }, profile: dev });
    expect(analyzeArtifact(overriddenOff, "dev").checks).toContainEqual({ id: "bom-module", pass: true });

    const missingWithoutOverride = makeDist({ chunk: ALWAYS_PRESENT, profile: dev });
    expect(analyzeArtifact(missingWithoutOverride, "dev").checks).toContainEqual({ id: "bom-module", pass: false });
  });
});
