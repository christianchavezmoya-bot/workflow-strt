import { describe, it, expect, vi, beforeEach } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import projectsReducer, {
  fetchProjects,
  createProject,
  updateProject,
  deleteProject,
} from "../../store/projectSlice";
import { projectService } from "../../services/projectService";
import type { Project } from "../../types/project";

vi.mock("../../services/projectService");

const makeProject = (overrides: Partial<Project> = {}): Project => ({
  id: "p1",
  customerName: "Acme Corp",
  customerId: "c1",
  jobNumber: "J-001",
  description: "Test project",
  startDate: "2026-01-01",
  finishDate: "2026-06-01",
  office: "Atlanta, United States",
  projectType: "External",
  status: "Active" as Project["status"],
  isInstallationProject: false,
  ...overrides,
});

function makeStore() {
  return configureStore({ reducer: { projects: projectsReducer } });
}

describe("projectSlice", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts in empty non-loading state", () => {
    const { projects } = makeStore().getState();
    expect(projects.items).toEqual([]);
    expect(projects.loading).toBe(false);
    expect(projects.total).toBe(0);
  });

  it("sets loading true while fetchProjects is pending", () => {
    vi.mocked(projectService.getProjects).mockReturnValue(new Promise(() => {}));
    const store = makeStore();
    store.dispatch(fetchProjects());
    expect(store.getState().projects.loading).toBe(true);
  });

  it("populates items on fetchProjects.fulfilled", async () => {
    const projects = [makeProject({ id: "p1" }), makeProject({ id: "p2" })];
    vi.mocked(projectService.getProjects).mockResolvedValue({ items: projects, total: 2 });
    const store = makeStore();
    await store.dispatch(fetchProjects());
    const state = store.getState().projects;
    expect(state.items).toHaveLength(2);
    expect(state.total).toBe(2);
    expect(state.loading).toBe(false);
  });

  it("sets error on fetchProjects.rejected", async () => {
    vi.mocked(projectService.getProjects).mockRejectedValue(new Error("net"));
    const store = makeStore();
    await store.dispatch(fetchProjects());
    expect(store.getState().projects.error).toBe("Failed to load projects");
  });

  it("prepends new project on createProject.fulfilled", async () => {
    const existing = makeProject({ id: "p1" });
    const newProj  = makeProject({ id: "p2" });
    vi.mocked(projectService.getProjects).mockResolvedValue({ items: [existing], total: 1 });
    vi.mocked(projectService.createProject).mockResolvedValue(newProj);
    const store = makeStore();
    await store.dispatch(fetchProjects());
    await store.dispatch(createProject(newProj));
    expect(store.getState().projects.items[0].id).toBe("p2");
  });

  it("removes project on deleteProject.fulfilled", async () => {
    const p = makeProject({ id: "p1" });
    vi.mocked(projectService.getProjects).mockResolvedValue({ items: [p], total: 1 });
    vi.mocked(projectService.deleteProject).mockResolvedValue("p1");
    const store = makeStore();
    await store.dispatch(fetchProjects());
    await store.dispatch(deleteProject("p1"));
    expect(store.getState().projects.items).toHaveLength(0);
  });

  it("updates project in-place on updateProject.fulfilled", async () => {
    const p       = makeProject({ id: "p1", status: "In Progress" });
    const updated = makeProject({ id: "p1", status: "Completed" });
    vi.mocked(projectService.getProjects).mockResolvedValue({ items: [p], total: 1 });
    vi.mocked(projectService.updateProject).mockResolvedValue(updated);
    const store = makeStore();
    await store.dispatch(fetchProjects());
    await store.dispatch(updateProject({ id: "p1", payload: { status: "Completed" } }));
    expect(store.getState().projects.items[0].status).toBe("Completed");
  });
});
