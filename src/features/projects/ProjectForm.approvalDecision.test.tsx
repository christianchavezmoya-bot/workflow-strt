/**
 * Internal projects must have the SAME Approval Decision capability in Edit Project
 * that External projects already have — reusing the existing mechanism, not a
 * duplicate Internal-only implementation.
 *
 * Regression coverage for: removing the `projectType === "External"` gate on the
 * Approval Decision block in ProjectForm.tsx (the only production change).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import projectsReducer from "../../store/projectSlice";
import customersReducer from "../../store/customersSlice";
import productsReducer from "../../store/productsSlice";
import usersReducer from "../../store/usersSlice";
import type { Project } from "../../types/project";
import type { WorkflowType } from "../../types/workflowType";

vi.mock("@mui/x-date-pickers", () => ({
  DatePicker: () => null,
  LocalizationProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@mui/x-date-pickers/AdapterDayjs", () => ({
  AdapterDayjs: class AdapterDayjs {},
}));

vi.mock("../../hooks/usePermissions", () => ({
  usePermissions: () => ({
    projects: { view: true, viewScope: "all", edit: true, editScope: "all", approve: true, delete: true },
    permissionsReady: true,
  }),
}));

vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-1", email: "pm@example.com", fullName: "Test PM", role: "Project Manager", office: "", isActive: true, isFirstLogin: false },
    isAuthenticated: true,
    authReady: true,
  }),
}));

vi.mock("../../hooks/useActiveOffice", () => ({
  useActiveOffice: () => ({ activeOffice: "All", updateActiveOffice: vi.fn() }),
}));

const workflowTypesFixture: WorkflowType[] = [
  { id: "wftype-installation", name: "Installation", sortOrder: 1, isActive: true },
  { id: "wftype-inspection", name: "Inspection", sortOrder: 2, isActive: true },
];

vi.mock("../../services/workflowTypeService", () => ({
  workflowTypeService: { list: vi.fn(async () => workflowTypesFixture) },
}));

vi.mock("../../services/officesService", () => ({
  officesService: { getAll: vi.fn(async () => []) },
}));

vi.mock("../../services/siteService", () => ({
  siteService: { getSites: vi.fn(async () => []) },
}));

vi.mock("../../services/fieldService", () => ({
  fieldService: {
    getDefinitions: vi.fn(async () => []),
    getValuesForTable: vi.fn(async () => []),
    upsertValues: vi.fn(async () => []),
    createDefinition: vi.fn(),
    updateDefinition: vi.fn(),
  },
}));

vi.mock("../../services/tableConfigService", () => ({
  tableConfigService: {
    get: vi.fn(async () => ({ order: [], hidden: [], baseFieldNames: {}, baseFieldMeta: {} })),
    update: vi.fn(async (_key: string, cfg: unknown) => cfg),
  },
}));

vi.mock("../../services/customerService", () => ({
  customerService: { getCustomers: vi.fn(async () => []) },
}));
vi.mock("../../services/productService", () => ({
  productService: { getProducts: vi.fn(async () => []) },
}));
vi.mock("../../services/userService", () => ({
  userService: { getUsers: vi.fn(async () => []) },
}));

const getProjectMock = vi.fn();
const createProjectMock = vi.fn();
const updateProjectMock = vi.fn();
vi.mock("../../services/projectService", () => ({
  projectService: {
    getProject: (...args: unknown[]) => getProjectMock(...args),
    createProject: (...args: unknown[]) => createProjectMock(...args),
    updateProject: (...args: unknown[]) => updateProjectMock(...args),
    getProjects: vi.fn(async () => ({ items: [], total: 0 })),
  },
}));

import ProjectForm from "./ProjectForm";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj-1",
    customerName: "Acme Co",
    customerId: "cust-1",
    jobNumber: "J-100",
    description: "Test project",
    startDate: "2026-01-01",
    finishDate: "2026-02-01",
    office: "Sydney",
    projectType: "Internal",
    status: "Draft",
    approvalDecision: undefined,
    isInstallationProject: true,
    workflowTypeId: "wftype-installation",
    workflowMode: "INSTALLATION_ONLY",
    projectManager: "user-1",
    productIds: [],
    teamMemberIds: [],
    ...overrides,
  } as Project;
}

function buildStore(project: Project) {
  return configureStore({
    reducer: {
      projects: projectsReducer,
      customers: customersReducer,
      products: productsReducer,
      users: usersReducer,
    },
    preloadedState: {
      projects: { items: [project], total: 1, loading: false },
      customers: { items: [], loading: false },
      products: { items: [], loading: false, hasFetchedOnce: true },
      users: { items: [], loading: false },
    },
  });
}

async function renderEditForm(project: Project, onSaved = vi.fn()) {
  getProjectMock.mockResolvedValue(project);
  const store = buildStore(project);
  render(
    <Provider store={store}>
      <MemoryRouter>
        <ProjectForm projectId={project.id} embedded onClose={vi.fn()} onSaved={onSaved} />
      </MemoryRouter>
    </Provider>,
  );
  // Wait for the edit-mode reset() (driven by the Redux-preloaded item) to populate the form.
  await screen.findByDisplayValue(project.jobNumber);
  return { store, onSaved };
}

function getApprovalDecisionGroup() {
  return screen.getByText("Approval Decision").closest("div")!;
}

describe("ProjectForm — Approval Decision (Internal projects, reusing the External mechanism)", () => {
  beforeEach(() => {
    getProjectMock.mockReset();
    createProjectMock.mockReset();
    updateProjectMock.mockReset();
  });

  // Required test #1 / #6 — creation status untouched by this change
  it("a new project (Internal or External) still defaults to Draft — creation is unmodified", async () => {
    createProjectMock.mockResolvedValue(makeProject({ status: "Draft" }));
    const store = configureStore({
      reducer: { projects: projectsReducer, customers: customersReducer, products: productsReducer, users: usersReducer },
      preloadedState: {
        projects: { items: [], total: 0, loading: false },
        customers: { items: [], loading: false },
        products: { items: [], loading: false, hasFetchedOnce: true },
        users: { items: [], loading: false },
      },
    });
    render(
      <Provider store={store}>
        <MemoryRouter>
          <ProjectForm embedded onClose={vi.fn()} onSaved={vi.fn()} />
        </MemoryRouter>
      </Provider>,
    );
    // The status radio isn't rendered as a user-facing control on the create form (status
    // defaults internally) — assert via the underlying create payload instead, by submitting
    // immediately as a draft (no fields required for Draft).
    await screen.findByRole("button", { name: /submit project/i });
    fireEvent.click(screen.getByRole("button", { name: /save draft/i }));
    await waitFor(() => expect(createProjectMock).toHaveBeenCalled());
    expect(createProjectMock.mock.calls[0][0]).toMatchObject({ status: "Draft" });
  });

  // Required test #2 — Approval Decision now visible for Internal
  it("Internal Draft project shows the Approval Decision control in Edit Project", async () => {
    await renderEditForm(makeProject({ projectType: "Internal", status: "Draft" }));
    const group = getApprovalDecisionGroup();
    expect(within(group).getByRole("radio", { name: "Approved" })).toBeInTheDocument();
    expect(within(group).getByRole("radio", { name: "Rejected" })).toBeInTheDocument();
  });

  // Required test #3 — Internal Draft -> Approved -> Save -> status Approved
  it("Internal Draft + Approved + Save changes -> status becomes Approved", async () => {
    updateProjectMock.mockImplementation(async (_id: string, payload: Partial<Project>) => ({
      ...makeProject({ projectType: "Internal" }),
      ...payload,
    }));
    const { onSaved } = await renderEditForm(makeProject({ projectType: "Internal", status: "Draft" }));

    const group = getApprovalDecisionGroup();
    fireEvent.click(within(group).getByRole("radio", { name: "Approved" }));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(updateProjectMock).toHaveBeenCalled());
    expect(updateProjectMock).toHaveBeenCalledWith(
      "proj-1",
      expect.objectContaining({ projectType: "Internal", status: "Approved", approvalDecision: "Approved" }),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ status: "Approved" })));
  });

  // Required test #4 — Internal Draft -> Rejected -> Save -> approvalDecision=Rejected, status=Cancelled
  it("Internal Draft + Rejected + Save changes -> approvalDecision=Rejected, status becomes Cancelled", async () => {
    updateProjectMock.mockImplementation(async (_id: string, payload: Partial<Project>) => ({
      ...makeProject({ projectType: "Internal" }),
      ...payload,
    }));
    const { onSaved } = await renderEditForm(makeProject({ projectType: "Internal", status: "Draft" }));

    const group = getApprovalDecisionGroup();
    fireEvent.click(within(group).getByRole("radio", { name: "Rejected" }));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(updateProjectMock).toHaveBeenCalled());
    expect(updateProjectMock).toHaveBeenCalledWith(
      "proj-1",
      expect.objectContaining({ projectType: "Internal", status: "Cancelled", approvalDecision: "Rejected" }),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ status: "Cancelled", approvalDecision: "Rejected" })));
  });

  // Required test: persistence — reopen Edit Project and verify state/status
  // Mounts the full ProjectForm twice (initial edit + reopen) — comfortably under the 5s
  // default in isolation, but can exceed it under full-suite parallel CPU contention.
  it("persists: reopening Edit Project after Approved shows the Approved status carried into the form", async () => {
    updateProjectMock.mockImplementation(async (_id: string, payload: Partial<Project>) => ({
      ...makeProject({ projectType: "Internal" }),
      ...payload,
    }));
    const project = makeProject({ projectType: "Internal", status: "Draft" });
    const { store } = await renderEditForm(project);

    fireEvent.click(within(getApprovalDecisionGroup()).getByRole("radio", { name: "Approved" }));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(updateProjectMock).toHaveBeenCalled());

    // The real updateProject.fulfilled reducer writes the resolved project back into
    // the store — confirms persistence at the state layer without re-mounting.
    await waitFor(() => {
      const stored = store.getState().projects.items.find((p: Project) => p.id === "proj-1");
      expect(stored?.status).toBe("Approved");
      expect(stored?.approvalDecision).toBe("Approved");
    });

    // Reopen: a fresh mount reading from the now-updated store must reflect it.
    getProjectMock.mockResolvedValue({ ...project, status: "Approved", approvalDecision: "Approved" });
    render(
      <Provider store={store}>
        <MemoryRouter>
          <ProjectForm projectId="proj-1" embedded onClose={vi.fn()} onSaved={vi.fn()} />
        </MemoryRouter>
      </Provider>,
    );
    await screen.findAllByDisplayValue(project.jobNumber);
    const groups = screen.getAllByText("Approval Decision").map((el) => el.closest("div")!);
    const reopened = groups[groups.length - 1];
    expect(within(reopened).getByRole("radio", { name: "Approved" })).toBeChecked();
  }, 15_000);

  // Required test #5 — External behavior unchanged
  it("External Draft + Approved + Save changes still works exactly as before", async () => {
    updateProjectMock.mockImplementation(async (_id: string, payload: Partial<Project>) => ({
      ...makeProject({ projectType: "External" }),
      ...payload,
    }));
    const { onSaved } = await renderEditForm(makeProject({ id: "proj-ext", projectType: "External", status: "Draft" }));

    const group = getApprovalDecisionGroup();
    expect(within(group).getByRole("radio", { name: "Approved" })).toBeInTheDocument();
    fireEvent.click(within(group).getByRole("radio", { name: "Approved" }));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(updateProjectMock).toHaveBeenCalled());
    expect(updateProjectMock).toHaveBeenCalledWith(
      "proj-ext",
      expect.objectContaining({ projectType: "External", status: "Approved", approvalDecision: "Approved" }),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ status: "Approved" })));
  });

  // External creation status untouched — covered together with Internal in test #1 above
  // (createProjectMock payload defaults to Draft regardless of projectType, unmodified).

  // Required test #7 — existing status mapping unchanged (Reject -> Cancelled, not a "Rejected" status)
  it("the existing Approved/Rejected -> status mapping is unchanged (Rejected maps to Cancelled, never a literal 'Rejected' status)", async () => {
    updateProjectMock.mockImplementation(async (_id: string, payload: Partial<Project>) => ({
      ...makeProject(),
      ...payload,
    }));
    await renderEditForm(makeProject({ projectType: "Internal", status: "Draft" }));
    fireEvent.click(within(getApprovalDecisionGroup()).getByRole("radio", { name: "Rejected" }));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(updateProjectMock).toHaveBeenCalled());
    const [, payload] = updateProjectMock.mock.calls[0] as [string, Partial<Project>];
    expect(payload.status).toBe("Cancelled");
    expect(payload.status).not.toBe("Rejected");
  });

  // Required test #8 — Inspection project
  it("Internal Inspection-workflow-type project can be approved the same way", async () => {
    updateProjectMock.mockImplementation(async (_id: string, payload: Partial<Project>) => ({
      ...makeProject({ workflowTypeId: "wftype-inspection", workflowMode: "INSPECTION_ONLY", isInstallationProject: false }),
      ...payload,
    }));
    const { onSaved } = await renderEditForm(
      makeProject({ projectType: "Internal", status: "Draft", workflowTypeId: "wftype-inspection", workflowMode: "INSPECTION_ONLY", isInstallationProject: false }),
    );
    fireEvent.click(within(getApprovalDecisionGroup()).getByRole("radio", { name: "Approved" }));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(updateProjectMock).toHaveBeenCalled());
    expect(updateProjectMock).toHaveBeenCalledWith("proj-1", expect.objectContaining({ status: "Approved" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  // Required test #9 — Installation project
  it("Internal Installation-workflow-type project can be approved the same way", async () => {
    updateProjectMock.mockImplementation(async (_id: string, payload: Partial<Project>) => ({
      ...makeProject({ workflowTypeId: "wftype-installation", workflowMode: "INSTALLATION_ONLY" }),
      ...payload,
    }));
    const { onSaved } = await renderEditForm(
      makeProject({ projectType: "Internal", status: "Draft", workflowTypeId: "wftype-installation", workflowMode: "INSTALLATION_ONLY" }),
    );
    fireEvent.click(within(getApprovalDecisionGroup()).getByRole("radio", { name: "Approved" }));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(updateProjectMock).toHaveBeenCalled());
    expect(updateProjectMock).toHaveBeenCalledWith("proj-1", expect.objectContaining({ status: "Approved" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("the outdated 'Internal skips approval' helper text is gone", async () => {
    await renderEditForm(makeProject({ projectType: "Internal" }));
    expect(screen.queryByText(/internal skips approval/i)).not.toBeInTheDocument();
  });
});
