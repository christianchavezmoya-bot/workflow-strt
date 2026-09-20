import { describe, expect, it } from "vitest";
import { createRunGeneration } from "./runGeneration";

describe("createRunGeneration", () => {
  it("is not running before any start()", () => {
    const gen = createRunGeneration();
    expect(gen.isRunning()).toBe(false);
  });

  it("start() makes the returned id active and isRunning() true", () => {
    const gen = createRunGeneration();
    const runId = gen.start();
    expect(gen.isRunning()).toBe(true);
    expect(gen.isActive(runId)).toBe(true);
  });

  it("start() returns strictly increasing ids", () => {
    const gen = createRunGeneration();
    const a = gen.start();
    gen.end(a);
    const b = gen.start();
    expect(b).toBeGreaterThan(a);
  });

  it("end() on the active run clears isRunning and isActive", () => {
    const gen = createRunGeneration();
    const runId = gen.start();
    expect(gen.end(runId)).toBe(true);
    expect(gen.isRunning()).toBe(false);
    expect(gen.isActive(runId)).toBe(false);
  });

  it("end() is idempotent — calling it twice is safe and only reports true once", () => {
    const gen = createRunGeneration();
    const runId = gen.start();
    expect(gen.end(runId)).toBe(true);
    expect(gen.end(runId)).toBe(false);
  });

  it("end() on a stale/superseded id does not touch the current run", () => {
    const gen = createRunGeneration();
    const oldId = gen.start();
    gen.end(oldId); // simulate a timeout ending the old run
    const newId = gen.start(); // a new run begins
    expect(gen.end(oldId)).toBe(false); // late end() from the old run is a no-op
    expect(gen.isRunning()).toBe(true);
    expect(gen.isActive(newId)).toBe(true);
  });

  it("a second start() while one is active supersedes it (isActive(old) becomes false)", () => {
    const gen = createRunGeneration();
    const first = gen.start();
    const second = gen.start();
    expect(gen.isActive(first)).toBe(false);
    expect(gen.isActive(second)).toBe(true);
  });
});
