import { describe, expect, it } from "vitest";
import { preserveLastNonEmpty } from "./preserveLastNonEmpty";

describe("preserveLastNonEmpty", () => {
  it("1. keeps existing non-empty data when a transient refresh returns [] (default/no signal = safe)", () => {
    const previous = [1, 2, 3];
    expect(preserveLastNonEmpty(previous, [])).toBe(previous);
  });

  it("2. allows the initial empty state through when previous was already empty", () => {
    expect(preserveLastNonEmpty([], [])).toEqual([]);
  });

  it("3. a later non-empty refresh replaces the previous state", () => {
    const next = [1, 2];
    expect(preserveLastNonEmpty([9], next)).toBe(next);
  });

  it("adopts the very first non-empty result when previous was empty", () => {
    const next = [1];
    expect(preserveLastNonEmpty([], next)).toBe(next);
  });

  it("while bootstrapping=true: an empty result never overwrites existing non-empty data", () => {
    const previous = ["a", "b"];
    expect(preserveLastNonEmpty(previous, [], { bootstrapping: true })).toBe(previous);
  });

  it("bootstrapping=false explicitly: an empty result is trusted and applied (real empty state reachable)", () => {
    const previous = ["a", "b"];
    expect(preserveLastNonEmpty(previous, [], { bootstrapping: false })).toEqual([]);
  });

  it("without a bootstrapping flag at all: defaults to the safe/preserving behavior", () => {
    const previous = ["a", "b"];
    expect(preserveLastNonEmpty(previous, [])).toBe(previous);
  });

  it("5. repeated bootstrap-flagged empty/partial snapshots never oscillate away real data, but a post-bootstrap confirmed result still lands", () => {
    let workload: number[] = [];
    // First real load, still mid-bootstrap.
    workload = preserveLastNonEmpty(workload, [1, 2, 3], { bootstrapping: true });
    expect(workload).toEqual([1, 2, 3]);

    // Several transient partial/empty snapshots arrive while bootstrap is still running.
    for (const partial of [[], [1], [], [1, 2]]) {
      workload = preserveLastNonEmpty(workload, partial, { bootstrapping: true });
      expect(workload.length).toBeGreaterThan(0); // never regresses to empty mid-bootstrap once populated
    }

    // Bootstrap finishes; a confirmed, larger authoritative result lands.
    workload = preserveLastNonEmpty(workload, [1, 2, 3, 4], { bootstrapping: false });
    expect(workload).toEqual([1, 2, 3, 4]);

    // And a genuine, confirmed-idle empty result (e.g. everyone's queue cleared)
    // is no longer hidden behind stale data once bootstrap is no longer running.
    workload = preserveLastNonEmpty(workload, [], { bootstrapping: false });
    expect(workload).toEqual([]);
  });

  it("does not mutate or copy when returning `next` unchanged (referential passthrough)", () => {
    const next = [{ id: 1 }];
    expect(preserveLastNonEmpty([], next)).toBe(next);
  });
});
