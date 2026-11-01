// @vitest-environment node
// Safety regression tests for the staging QA tooling. Everything runs against an in-memory fake
// API through the injected fetch; no network, no real credentials.
import { describe, expect, it, vi } from "vitest";
import { ApiError, LOCAL_API, QA_ACCOUNTS, STAGING_API, SafetyError, assertAllowedBase, createApi, login, resolveApiBase, secret } from "./qa-lib.mjs";
import { provisionUsers } from "./provision-users.mjs";
import { seedProject } from "./seed-project.mjs";
import { cleanupProject } from "./cleanup-project.mjs";

const PASSWORD = "S3cret-Pa55word!";
const TOKEN = "eyJhbGciOiJIUzI1NiJ9.qa-token-value";
const ADMIN_TOKEN = "eyJhbGciOiJIUzI1NiJ9.admin-token-value";

/** Minimal in-memory API. `faults` maps "METHOD /path" (query stripped) to a status, "network" or a function. */
function fakeApi({ users = [], projects = [], customers = [], faults = {}, noopDeletes = false } = {}) {
  const db = { users: users.map((u) => ({ ...u })), projects: projects.map((p) => ({ ...p })), customers: customers.map((c) => ({ ...c })) };
  const requests = [];
  const json = (status, body) => new Response(body === undefined || status === 204 ? null : JSON.stringify(body), { status });
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    const route = u.pathname.replace(/^\/api/, "");
    const key = `${init.method} ${route}`;
    requests.push({ key, url, auth: init.headers.Authorization ?? null });
    const fault = faults[key];
    if (fault === "network") throw new TypeError(`fetch failed: connect ECONNREFUSED (Authorization: ${init.headers.Authorization})`);
    if (typeof fault === "number") return json(fault, { message: `echo password=${PASSWORD} token=${TOKEN}` });
    const body = init.body ? JSON.parse(init.body) : undefined;
    let m;
    if (key === "POST /auth/login") {
      const user = db.users.find((x) => x.email === body.email);
      if (!user || body.password !== PASSWORD || !user.isActive) return json(401, { message: `bad credentials for ${body.email} / ${body.password}` });
      return json(200, { token: TOKEN, user });
    }
    if (key === "GET /users") return json(200, db.users);
    if (key === "GET /role-configs") return json(200, { roles: { Admin: {}, "Project Manager": {}, Installer: {} } });
    if (key === "POST /users") { const x = { ...body, id: `u${db.users.length + 1}`, isActive: false }; db.users.push(x); return json(201, x); }
    if ((m = key.match(/^PATCH \/users\/(.+)$/))) { Object.assign(db.users.find((x) => x.id === m[1]), body); return json(200, {}); }
    if (key.match(/^POST \/users\/.+\/invite$/)) return json(204);
    if (key === "GET /workflow-types") return json(200, [{ id: "wftype-commissioning", name: "Commissioning", isActive: true }, { id: "wftype-repair", name: "Repair", isActive: true }]);
    if (key === "GET /products") return json(200, [{ id: "prod-1" }]);
    if (key === "GET /workflow-configs/by-product/prod-1") return json(200, [{ id: "cfg-c", status: "Published", workflowTypeId: "wftype-commissioning", name: "C" }]);
    if (key === "GET /customers") return json(200, db.customers);
    if (key === "POST /customers") { const x = { ...body, id: `c${db.customers.length + 1}` }; db.customers.push(x); return json(201, x); }
    if ((m = key.match(/^DELETE \/customers\/(.+)$/))) { if (noopDeletes !== true && noopDeletes !== "customer") db.customers = db.customers.filter((x) => x.id !== m[1]); return json(204); }
    if (key === "POST /projects") { const x = { ...body, id: `p${db.projects.length + 1}`, isDeleted: false }; db.projects.push(x); return json(201, x); }
    if ((m = key.match(/^PATCH \/projects\/(.+)\/status$/))) return json(200, {});
    if ((m = key.match(/^GET \/projects\/(.+)$/))) { const p = db.projects.find((x) => x.id === m[1]); return p ? json(200, p) : json(404, { message: "nope" }); }
    if ((m = key.match(/^DELETE \/projects\/(.+)$/))) { const p = db.projects.find((x) => x.id === m[1]); if (p && noopDeletes !== true && noopDeletes !== "project") p.isDeleted = true; return json(204); }
    if (key === "POST /project-assets") return json(201, { id: `a-${body.assetTag}` });
    return json(500, { message: "unrouted" });
  };
  const writes = () => requests.filter((r) => !r.key.startsWith("GET ") && r.key !== "POST /auth/login");
  return { db, requests, writes, call: createApi({ base: LOCAL_API, fetchImpl }) };
}

const pmUser = (over = {}) => ({ id: "u-pm", email: "qa-pm@example.test", fullName: QA_ACCOUNTS.pm.fullName, role: "Project Manager", isActive: true, ...over });
const instUser = (over = {}) => ({ id: "u-in", email: "qa-in@example.test", fullName: QA_ACCOUNTS.installer.fullName, role: "Installer", isActive: false, ...over });
const emails = { pm: "qa-pm@example.test", installer: "qa-in@example.test" };
const silent = () => {};
const recordedState = { users: { pm: { id: "u-pm", email: "qa-pm@example.test" }, installer: { id: "u-in", email: "qa-in@example.test" } } };
const seededState = { ...recordedState, project: { id: "p1", jobNumber: "ZZQA-20261102-010203" }, customer: { id: "c1", name: "ZZQA QA Customer 20261102-010203" } };
const seededDb = () => ({
  users: [pmUser(), instUser()],
  projects: [{ id: "p1", jobNumber: "ZZQA-20261102-010203", isDeleted: false }],
  customers: [{ id: "c1", name: "ZZQA QA Customer 20261102-010203" }],
});

describe("host allowlist — production is unreachable", () => {
  it.each([
    "https://api.strata-ngo.com/api", "https://www.strata-ngo.com/api", "https://strata-ngo.com/api",
    "http://api.staging.strata-ngo.com/api", "https://api.staging.strata-ngo.com.evil.example/api",
    "https://api.staging.strata-ngo.com", "https://evil.example/api", "",
  ])("refuses %j before any request", async (base) => {
    const fetchImpl = vi.fn();
    expect(() => assertAllowedBase(base)).toThrow(SafetyError);
    expect(() => createApi({ base, fetchImpl })).toThrow(SafetyError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("resolves only to staging or local dev", () => {
    expect(resolveApiBase([])).toBe(STAGING_API);
    expect(resolveApiBase(["--local"])).toBe(LOCAL_API);
    expect(resolveApiBase(["--api=https://api.strata-ngo.com/api"])).toBe(STAGING_API); // no override flag exists
  });
});

describe("dry run makes no writes", () => {
  it("provision", async () => {
    const api = fakeApi({ users: [] });
    await provisionUsers({ call: api.call, token: ADMIN_TOKEN, apply: false, emails, log: silent });
    expect(api.writes()).toEqual([]);
  });
  it("deactivate", async () => {
    const api = fakeApi({ users: [pmUser(), instUser({ isActive: true })] });
    await provisionUsers({ call: api.call, token: ADMIN_TOKEN, apply: false, deactivate: true, state: recordedState, log: silent });
    expect(api.writes()).toEqual([]);
    expect(api.db.users.every((u) => u.id === "u-in" ? u.isActive : true)).toBe(true);
  });
  it("seed", async () => {
    const api = fakeApi({ users: [pmUser()] });
    await seedProject({ call: api.call, email: "qa-pm@example.test", password: PASSWORD, apply: false, log: silent });
    expect(api.writes()).toEqual([]);
  });
  it("cleanup", async () => {
    const api = fakeApi(seededDb());
    const { result } = await cleanupProject({ call: api.call, email: "qa-pm@example.test", password: PASSWORD, apply: false, state: seededState, log: silent });
    expect(result).toEqual({ project: "would-delete", customer: "would-delete" });
    expect(api.writes()).toEqual([]);
  });
});

describe("existing accounts are reused or deactivated only on a full identity match", () => {
  it.each([
    ["different full name", { fullName: "Real Person" }],
    ["different role", { role: "Admin" }],
  ])("provision refuses an existing user with the QA email but a %s", async (_, over) => {
    const api = fakeApi({ users: [pmUser(over)] });
    await expect(provisionUsers({ call: api.call, token: ADMIN_TOKEN, apply: true, emails, log: silent })).rejects.toThrow(/does not match the QA identity/);
    expect(api.writes()).toEqual([]);
  });

  it("provision refuses when the recorded id belongs to someone else", async () => {
    const api = fakeApi({ users: [pmUser({ id: "u-other" })] });
    await expect(provisionUsers({ call: api.call, token: ADMIN_TOKEN, apply: true, emails, state: recordedState, log: silent })).rejects.toThrow(/id differs/);
    expect(api.writes()).toEqual([]);
  });

  it("provision refuses a different email than the recorded QA user", async () => {
    const api = fakeApi({ users: [pmUser()] });
    await expect(provisionUsers({ call: api.call, token: ADMIN_TOKEN, apply: true, emails: { ...emails, pm: "someone@example.test" }, state: recordedState, log: silent }))
      .rejects.toThrow(/different QA user/);
    expect(api.writes()).toEqual([]);
  });

  it("an already-active QA user is not re-invited (re-inviting would deactivate it)", async () => {
    const api = fakeApi({ users: [pmUser({ isActive: true }), instUser({ isActive: false })] });
    await provisionUsers({ call: api.call, token: ADMIN_TOKEN, apply: true, emails, log: silent });
    expect(api.writes().map((r) => r.key)).toEqual(["POST /users/u-in/invite"]);
  });

  it.each([
    ["email changed", { email: "changed@example.test" }],
    ["renamed to a real person", { fullName: "Real Person" }],
    ["promoted to Admin", { role: "Admin" }],
  ])("deactivation refuses when the recorded user was %s", async (_, over) => {
    const api = fakeApi({ users: [pmUser(over), instUser()] });
    await expect(provisionUsers({ call: api.call, token: ADMIN_TOKEN, apply: true, deactivate: true, state: recordedState, log: silent }))
      .rejects.toThrow(/does not match the QA identity/);
    expect(api.writes()).toEqual([]);
  });

  it("deactivation is verified by reading the user back", async () => {
    const api = fakeApi({ users: [pmUser(), instUser()] });
    await provisionUsers({ call: api.call, token: ADMIN_TOKEN, apply: true, deactivate: true, state: recordedState, log: silent });
    expect(api.db.users.find((u) => u.id === "u-pm").isActive).toBe(false);
  });

  it("seed refuses any account other than the ZZQA QA Project Manager", async () => {
    const api = fakeApi({ users: [pmUser({ fullName: "Real PM" })] });
    await expect(seedProject({ call: api.call, email: "qa-pm@example.test", password: PASSWORD, apply: true, log: silent })).rejects.toThrow(SafetyError);
    expect(api.writes()).toEqual([]);
  });
});

describe("credentials and tokens never leak into errors or logs", () => {
  const leaks = (text) => [PASSWORD, TOKEN, ADMIN_TOKEN, "echo password", "bad credentials"].filter((s) => text.includes(s));

  it("rejected login: error has the status, not the response body or the password", async () => {
    const api = fakeApi({ users: [pmUser()] });
    const err = await login(api.call, "qa-pm@example.test", "wrong-" + PASSWORD).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.kind).toBe("login_rejected");
    expect(leaks(err.message)).toEqual([]);
    expect(err.message).not.toContain("wrong-");
  });

  it.each([401, 403, 500])("HTTP %i on an account-management call: body redacted", async (status) => {
    const api = fakeApi({ users: [], faults: { "GET /users": status } });
    const err = await provisionUsers({ call: api.call, token: ADMIN_TOKEN, apply: true, emails, log: silent }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(status);
    expect(leaks(err.message)).toEqual([]);
  });

  it("network failure: the underlying error (which can carry headers) is dropped", async () => {
    const api = fakeApi({ users: [], faults: { "GET /users": "network" } });
    const err = await provisionUsers({ call: api.call, token: ADMIN_TOKEN, apply: true, emails, log: silent }).catch((e) => e);
    expect(err.kind).toBe("network");
    expect(leaks(err.message)).toEqual([]);
  });

  it("logs from a full provision → seed → cleanup run contain no secrets", async () => {
    const lines = [];
    const log = (m) => lines.push(m);
    const api = fakeApi({ users: [pmUser(), instUser({ isActive: true })] });
    await provisionUsers({ call: api.call, token: ADMIN_TOKEN, apply: true, emails, log });
    const seeded = await seedProject({ call: api.call, email: "qa-pm@example.test", password: PASSWORD, apply: true, state: recordedState, log });
    await cleanupProject({ call: api.call, email: "qa-pm@example.test", password: PASSWORD, apply: true, state: seeded, log });
    expect(lines.length).toBeGreaterThan(5);
    expect(leaks(lines.join("\n"))).toEqual([]);
  });

  it("a missing credential names where to put it, without any value", () => {
    const err = (() => { try { secret("QA_PM_PASSWORD", "svc", "acct", { env: {}, platform: "linux" }); } catch (e) { return e; } })();
    expect(err.message).toMatch(/QA_PM_PASSWORD/);
    expect(secret("QA_PM_PASSWORD", "svc", "acct", { env: { QA_PM_PASSWORD: PASSWORD }, platform: "linux" })).toBe(PASSWORD);
  });
});

describe("cleanup: verified deletion vs every failure mode", () => {
  const run = (api, state = seededState) => cleanupProject({ call: api.call, email: "qa-pm@example.test", password: PASSWORD, apply: true, state, log: silent });

  it("happy path: both deletions are verified by reading back", async () => {
    const api = fakeApi(seededDb());
    const { result, state } = await run(api);
    expect(result).toEqual({ project: "deleted", customer: "deleted" });
    expect(api.db.projects[0].isDeleted).toBe(true);
    expect(api.db.customers).toEqual([]);
    expect(state.project).toBeUndefined();
  });

  it("404 on the recorded project is reported as absent (not as a deletion) and the customer is still handled", async () => {
    const api = fakeApi({ ...seededDb(), projects: [] });
    const { result } = await run(api);
    expect(result).toEqual({ project: "absent", customer: "deleted" });
    expect(api.writes().map((r) => r.key)).toEqual(["DELETE /customers/c1"]);
  });

  it.each([401, 403, 500, "network"])("%s while reading the project aborts: nothing deleted, customer untouched", async (fault) => {
    const api = fakeApi({ ...seededDb(), faults: { "GET /projects/p1": fault } });
    await expect(run(api)).rejects.toThrow(/cannot verify .* aborting/);
    expect(api.writes()).toEqual([]);
    expect(api.db.customers).toHaveLength(1);
  });

  it.each([401, 403, "network"])("%s on the project DELETE is a failure, never a deletion; customer untouched", async (fault) => {
    const api = fakeApi({ ...seededDb(), faults: { "DELETE /projects/p1": fault } });
    await expect(run(api)).rejects.toThrow(/project delete failed/);
    expect(api.db.projects[0].isDeleted).toBe(false);
    expect(api.db.customers).toHaveLength(1);
  });

  it("a DELETE that reports success but leaves the record is caught as unverified", async () => {
    const api = fakeApi({ ...seededDb(), noopDeletes: true });
    await expect(run(api)).rejects.toThrow(/not verified/);
    expect(api.db.customers).toHaveLength(1);
  });

  it("a project DELETE that reports success but leaves the project undeleted stops before the customer", async () => {
    const api = fakeApi({ ...seededDb(), noopDeletes: "project" });
    await expect(run(api)).rejects.toThrow(/project delete not verified/);
    expect(api.writes().map((r) => r.key)).toEqual(["DELETE /projects/p1"]);
    expect(api.db.customers).toHaveLength(1);
  });

  it("a customer DELETE that reports success but leaves the customer listed is caught", async () => {
    const api = fakeApi({ ...seededDb(), noopDeletes: "customer" });
    await expect(run(api)).rejects.toThrow(/customer delete not verified/);
    expect(api.db.projects[0].isDeleted).toBe(true);
  });

  it("refuses a recorded project that is not the recorded ZZQA project", async () => {
    const api = fakeApi({ ...seededDb(), projects: [{ id: "p1", jobNumber: "J000376", isDeleted: false }] });
    await expect(run(api)).rejects.toThrow(/refusing/);
    expect(api.writes()).toEqual([]);
  });

  it("refuses a recorded customer that is not the recorded ZZQA customer", async () => {
    const api = fakeApi({ ...seededDb(), customers: [{ id: "c1", name: "Real Customer Pty" }] });
    await expect(run(api)).rejects.toThrow(/refusing/);
    expect(api.db.customers).toHaveLength(1);
  });

  it("a second cleanup over already-deleted records reports them as such", async () => {
    const api = fakeApi({ ...seededDb(), projects: [{ id: "p1", jobNumber: "ZZQA-20261102-010203", isDeleted: true }], customers: [] });
    const { result } = await run(api);
    expect(result).toEqual({ project: "already-deleted", customer: "absent" });
    expect(api.writes()).toEqual([]);
  });
});
