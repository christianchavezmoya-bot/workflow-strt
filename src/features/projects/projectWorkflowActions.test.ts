/**
 * projectWorkflowActions.ts is the OTHER existing, project-type-agnostic approval
 * mechanism (the chevron/stepper actions on the Projects list/detail pages). It is
 * untouched by the Internal-project Approval Decision fix in ProjectForm.tsx —
 * these tests lock in its current Approve/Reject status-mapping behavior so a
 * future change here is caught, and document that it was never itself restricted
 * by projectType (getProjectWorkflowActions never reads project.projectType).
 */
import { describe, expect, it, vi } from "vitest";
import type { Project } from "../../types/project";

const updateProjectStatusMock = vi.fn();
vi.mock("../../store/projectSlice", () => ({
  updateProjectStatus: (arg: unknown) => {
    updateProjectStatusMock(arg);
    return { type: "projects/updateStatus", payload: arg };
  },
}));

const { executeProjectWorkflowAction, getProjectWorkflowActions } = await import("./projectWorkflowActions");

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj-1",
    customerName: "Acme",
    customerId: "cust-1",
    jobNumber: "J-1",
    description: "",
    startDate: "2026-01-01",
    finishDate: "2026-02-01",
    office: "Sydney",
    projectType: "Internal",
    status: "Draft",
    isInstallationProject: true,
    productIds: [],
    teamMemberIds: [],
    ...overrides,
  } as Project;
}

function fakeDispatch(resolvedProject: Project) {
  const dispatch = vi.fn(() => ({ unwrap: () => Promise.resolve(resolvedProject) }));
  return dispatch as unknown as Parameters<typeof executeProjectWorkflowAction>[0];
}

describe("projectWorkflowActions — chevron approval mechanism (unchanged by the Internal Approval Decision fix)", () => {
  it("is project-type agnostic — never reads project.projectType for action availability (Internal and External identical)", () => {
    const internal = makeProject({ projectType: "Internal", status: "Pending Approval" });
    const external = makeProject({ projectType: "External", status: "Pending Approval" });
    const options = { userRole: "Admin", canApprove: true, canEditProject: true, surface: "detail" as const };
    expect(getProjectWorkflowActions(internal, options)).toEqual(getProjectWorkflowActions(external, options));
  });

  it("Draft + Project Manager + canEditProject -> offers Submit for Approval", () => {
    const actions = getProjectWorkflowActions(makeProject({ status: "Draft" }), {
      userRole: "Project Manager",
      canEditProject: true,
      surface: "detail",
    });
    expect(actions).toContain("Submit for Approval");
  });

  it("Pending Approval + canApprove -> offers Approve/Request Info/Reject", () => {
    const actions = getProjectWorkflowActions(makeProject({ status: "Pending Approval" }), {
      canApprove: true,
      canEditProject: true,
      surface: "detail",
    });
    expect(actions).toEqual(expect.arrayContaining(["Approve", "Request Info", "Reject"]));
  });

  it("Pending Approval WITHOUT canApprove -> Approve/Request Info/Reject are not offered", () => {
    const actions = getProjectWorkflowActions(makeProject({ status: "Pending Approval" }), {
      canApprove: false,
      canEditProject: true,
      surface: "detail",
    });
    expect(actions).not.toContain("Approve");
    expect(actions).not.toContain("Reject");
  });

  // Locks in the exact status-mapping convention ProjectForm.tsx's Approval Decision
  // reuses: Approve -> status "Approved"; Reject -> status "Cancelled" with
  // approvalDecision "Rejected" (never a literal "Rejected" status).
  it("'Approve' sends status Approved + approvalDecision Approved", async () => {
    updateProjectStatusMock.mockClear();
    const dispatch = fakeDispatch(makeProject({ status: "Approved", approvalDecision: "Approved" }));
    await executeProjectWorkflowAction(dispatch, vi.fn(), makeProject({ status: "Pending Approval" }), "Approve");
    expect(updateProjectStatusMock).toHaveBeenCalledWith({
      id: "proj-1",
      payload: { status: "Approved", approvalDecision: "Approved" },
    });
  });

  it("'Reject' sends status Cancelled + approvalDecision Rejected", async () => {
    updateProjectStatusMock.mockClear();
    const dispatch = fakeDispatch(makeProject({ status: "Cancelled", approvalDecision: "Rejected" }));
    await executeProjectWorkflowAction(dispatch, vi.fn(), makeProject({ status: "Pending Approval" }), "Reject");
    expect(updateProjectStatusMock).toHaveBeenCalledWith({
      id: "proj-1",
      payload: { status: "Cancelled", approvalDecision: "Rejected" },
    });
  });
});
