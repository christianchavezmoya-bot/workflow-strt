import { execFileSync } from "node:child_process";

try {
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], {
    stdio: "ignore",
  });
  console.log("Configured git hooks path to .githooks");
} catch (error) {
  console.warn("Could not configure git hooks path automatically.");
  console.warn(error instanceof Error ? error.message : String(error));
}
