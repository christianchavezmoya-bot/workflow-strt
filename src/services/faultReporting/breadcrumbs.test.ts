import { beforeEach, describe, expect, it } from "vitest";
import {
  clearBreadcrumbs,
  getBreadcrumbs,
  recordActionBreadcrumb,
  recordRouteBreadcrumb,
} from "./breadcrumbs";

describe("breadcrumbs", () => {
  beforeEach(() => {
    clearBreadcrumbs();
  });

  it("records routes and actions in order", () => {
    recordRouteBreadcrumb("/projects");
    recordActionBreadcrumb("started run");
    recordRouteBreadcrumb("/projects/abc");

    expect(getBreadcrumbs().map((b) => [b.type, b.label])).toEqual([
      ["route", "/projects"],
      ["action", "started run"],
      ["route", "/projects/abc"],
    ]);
  });

  it("collapses repeated navigation to the same route", () => {
    recordRouteBreadcrumb("/projects");
    recordRouteBreadcrumb("/projects");
    recordRouteBreadcrumb("/projects");

    expect(getBreadcrumbs()).toHaveLength(1);
  });

  it("does not collapse a repeat once the user has been elsewhere", () => {
    recordRouteBreadcrumb("/projects");
    recordRouteBreadcrumb("/issues");
    recordRouteBreadcrumb("/projects");

    expect(getBreadcrumbs()).toHaveLength(3);
  });

  it("drops the query string, which can carry ids and tokens", () => {
    recordRouteBreadcrumb("/sign/abc?token=secret-value");
    expect(getBreadcrumbs()[0].label).toBe("/sign/abc");
    expect(JSON.stringify(getBreadcrumbs())).not.toContain("secret-value");
  });

  it("keeps only the most recent entries so the trail cannot grow without bound", () => {
    for (let i = 0; i < 100; i += 1) {
      recordActionBreadcrumb(`action ${i}`);
    }

    const trail = getBreadcrumbs();
    expect(trail).toHaveLength(40);
    expect(trail[trail.length - 1].label).toBe("action 99");
  });

  it("returns a copy so callers cannot mutate the trail", () => {
    recordRouteBreadcrumb("/projects");
    getBreadcrumbs().push({ ts: "now", type: "action", label: "injected" });
    expect(getBreadcrumbs()).toHaveLength(1);
  });
});
