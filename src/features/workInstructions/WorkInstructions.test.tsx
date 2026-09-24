import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { AppToastProvider } from "../../contexts/AppToastContext";
import productsReducer from "../../store/productsSlice";
import projectsReducer from "../../store/projectSlice";
import usersReducer from "../../store/usersSlice";
import customersReducer from "../../store/customersSlice";
import type { Product } from "../../types/product";

vi.mock("@mui/x-date-pickers", () => ({
  DatePicker: () => null,
  LocalizationProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@mui/x-date-pickers/AdapterDayjs", () => ({
  AdapterDayjs: class AdapterDayjs {},
}));

vi.mock("../../hooks/usePermissions", () => ({
  usePermissions: () => ({
    workInstructionsBuilder: { build: true, publish: true, archive: true, delete: true, viewScope: "all" },
    permissionsReady: true,
  }),
}));

const getByProductMock = vi.fn().mockResolvedValue([]);
vi.mock("../../services/featureService", () => ({
  featureService: {
    getByProduct: (...args: unknown[]) => getByProductMock(...args),
  },
}));

const listByProductMock = vi.fn().mockResolvedValue([]);
const createConfigMock = vi.fn();
const updateConfigMock = vi.fn();
vi.mock("../../services/workflowConfigService", () => ({
  workflowConfigService: {
    listByProduct: (...args: unknown[]) => listByProductMock(...args),
    getById: vi.fn().mockResolvedValue(null),
    create: (...args: unknown[]) => createConfigMock(...args),
    update: (...args: unknown[]) => updateConfigMock(...args),
    archive: vi.fn(),
  },
}));

const listWorkflowTypesMock = vi.fn().mockResolvedValue([]);
vi.mock("../../services/workflowTypeService", () => ({
  workflowTypeService: {
    list: (...args: unknown[]) => listWorkflowTypesMock(...args),
  },
}));

import WorkInstructions, { parseSteps } from "./WorkInstructions";
import type { WorkflowConfig } from "../../types/workflowConfig";

function makeProduct(id: string, name: string): Product {
  return { id, name, description: "", features: [] } as Product;
}

function buildStore(initialProducts: Product[]) {
  return configureStore({
    reducer: {
      projects: projectsReducer,
      users: usersReducer,
      customers: customersReducer,
      products: productsReducer,
    },
    preloadedState: {
      products: { items: initialProducts, loading: false, hasFetchedOnce: true },
    },
  });
}

describe("WorkInstructions — activeProduct effect regression", () => {
  beforeEach(() => {
    getByProductMock.mockClear();
  });

  it(
    "does not re-fetch product features when the products list is replaced with brand-new " +
    "object instances carrying the same id/data — regression for the bug where the feature-" +
    "fetch effect depended on the `activeProduct` object itself (identity) instead of " +
    "`activeProduct?.id` (value), so ANY background products refetch (e.g. dispatched from a " +
    "different page while this one is also mounted) re-triggered it even though nothing about " +
    "the active product had actually changed",
    async () => {
      const product = makeProduct("prod-1", "Test Product");
      const store = buildStore([product]);

      render(
        <Provider store={store}>
          <AppToastProvider>
            <MemoryRouter initialEntries={["/work-instructions?product=prod-1&view=instructions"]}>
              <WorkInstructions />
            </MemoryRouter>
          </AppToastProvider>
        </Provider>,
      );

      await waitFor(() => expect(getByProductMock).toHaveBeenCalledTimes(1));
      expect(getByProductMock).toHaveBeenCalledWith("prod-1");

      // Simulate exactly what fetchProducts.fulfilled does on a background refetch: a brand
      // new array of brand new object instances, same id and same field values.
      const refetchedSameProduct = makeProduct("prod-1", "Test Product");
      store.dispatch({ type: "products/fetch/fulfilled", payload: [refetchedSameProduct] });

      // Give effects a chance to run if they were going to.
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(getByProductMock).toHaveBeenCalledTimes(1);
    },
  );

  it("still refetches product features when mounted on a genuinely different product id", async () => {
    // Sanity check that the fix is scoped to id-equality (via `activeProduct?.id`), not a
    // blanket "never refetch again" — a real product switch must still fetch its features.
    const productB = makeProduct("prod-2", "Product B");
    const store = buildStore([productB]);

    render(
      <Provider store={store}>
        <AppToastProvider>
          <MemoryRouter initialEntries={["/work-instructions?product=prod-2&view=instructions"]}>
            <WorkInstructions />
          </MemoryRouter>
        </AppToastProvider>
      </Provider>,
    );

    await waitFor(() => expect(getByProductMock).toHaveBeenCalledTimes(1));
    expect(getByProductMock).toHaveBeenCalledWith("prod-2");
  });
});

describe("parseSteps — reference Content reaches the Preview runner (TEST E)", () => {
  function configWithMedia(): WorkflowConfig {
    return {
      id: "cfg-1",
      name: "Test",
      productId: "p1",
      version: 1,
      status: "Published",
      stepsJson: JSON.stringify([
        { id: "s1", order: 1, title: "Step 1", description: "", overrideInReport: false, overrideReportText: "", includeDescriptionInReport: true, mediaIds: ["photoA"], decisionsEnabled: false, decisions: [], inputs: [], nextStepId: null },
      ]),
      mediaJson: JSON.stringify([
        { id: "photoA", type: "image", name: "photoA.jpg", size: 100, mime: "image/jpeg", url: "/media/photoA", createdAt: 1 },
      ]),
      featureSelectionsJson: "[]",
      configType: "Install",
      displayName: "Test",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  it("populates workflow.media from a config with non-empty mediaJson (previously always []) ", () => {
    const workflow = parseSteps(configWithMedia());

    expect(workflow?.media).toHaveLength(1);
    expect(workflow?.media[0]?.id).toBe("photoA");
    expect(workflow?.steps[0]?.mediaIds).toEqual(["photoA"]);
  });

  it("returns an empty media array (not a crash) for a config with no mediaJson media", () => {
    const cfg = configWithMedia();
    cfg.mediaJson = "[]";

    const workflow = parseSteps(cfg);

    expect(workflow?.media).toEqual([]);
  });
});

// ── Workflow metadata fix: Description in the New Workflow flow + list rendering ────────────

function makeConfig(overrides: Partial<WorkflowConfig> = {}): WorkflowConfig {
  return {
    id: "cfg-1",
    name: "Test Workflow",
    productId: "prod-1",
    version: 1,
    status: "Draft",
    stepsJson: "[]",
    mediaJson: "[]",
    featureSelectionsJson: "[]",
    configType: "Install",
    displayName: "Test Workflow",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

async function renderInstructionsView(product: Product) {
  const store = buildStore([product]);
  render(
    <Provider store={store}>
      <AppToastProvider>
        <MemoryRouter initialEntries={[`/work-instructions?product=${product.id}&view=instructions`]}>
          <WorkInstructions />
        </MemoryRouter>
      </AppToastProvider>
    </Provider>,
  );
  await waitFor(() => expect(listByProductMock).toHaveBeenCalled());
}

describe("New Workflow dialog — Description (workflow-metadata fix)", () => {
  beforeEach(() => {
    listByProductMock.mockClear();
    listByProductMock.mockResolvedValue([]);
    createConfigMock.mockClear();
  });

  it("shows both Product and Description in the primary New Workflow step, before entering the Builder", async () => {
    const product = makeProduct("prod-1", "Test Product");
    await renderInstructionsView(product);

    fireEvent.click(await screen.findByRole("button", { name: /\+ new workflow/i }));

    expect(await screen.findByLabelText(/select product/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
  });

  it("Description is optional — Continue is not blocked by leaving it empty", async () => {
    const product = makeProduct("prod-1", "Test Product");
    createConfigMock.mockResolvedValue(makeConfig({ id: "cfg-new", productId: "prod-1" }));
    await renderInstructionsView(product);

    fireEvent.click(await screen.findByRole("button", { name: /\+ new workflow/i }));
    await screen.findByLabelText(/select product/i);
    // Product defaults to the active product already; Description is left untouched (empty).
    const continueButton = screen.getByRole("button", { name: /continue/i });
    expect(continueButton).toBeEnabled();

    fireEvent.click(continueButton);

    await waitFor(() => expect(createConfigMock).toHaveBeenCalled());
    expect(createConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({ productId: "prod-1", notes: undefined }),
    );
  });

  it("Description typed during New Workflow creation is sent as `notes` on the create request", async () => {
    const product = makeProduct("prod-1", "Test Product");
    createConfigMock.mockResolvedValue(makeConfig({ id: "cfg-new", productId: "prod-1" }));
    await renderInstructionsView(product);

    fireEvent.click(await screen.findByRole("button", { name: /\+ new workflow/i }));
    await screen.findByLabelText(/select product/i);

    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: "Installs the front-facing camera and wiring harness." },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(createConfigMock).toHaveBeenCalled());
    expect(createConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: "prod-1",
        notes: "Installs the front-facing camera and wiring harness.",
      }),
    );
    // Never a second, separately-named "description" property — the API/DTO field is notes.
    expect(createConfigMock.mock.calls[0]?.[0]).not.toHaveProperty("description");
  });
});

describe("Edit Workflow dialog — Description still works (workflow-metadata fix, pre-existing path unchanged)", () => {
  beforeEach(() => {
    listByProductMock.mockClear();
    updateConfigMock.mockClear();
    listWorkflowTypesMock.mockClear();
    listWorkflowTypesMock.mockResolvedValue([
      { id: "wftype-installation", name: "Installation", sortOrder: 1, isActive: true },
    ]);
  });

  it("pre-fills the existing Description, and saving an edit still sends the updated notes", async () => {
    const product = makeProduct("prod-1", "Test Product");
    const existing = makeConfig({
      id: "cfg-edit",
      status: "Draft",
      notes: "Original description.",
      workflowTypeId: "wftype-installation",
    });
    listByProductMock.mockResolvedValue([existing]);
    updateConfigMock.mockResolvedValue({ ...existing, notes: "Revised description." });

    await renderInstructionsView(product);
    await screen.findByText("Test Workflow");

    fireEvent.click(screen.getByRole("button", { name: /details/i }));

    const descriptionField = await screen.findByLabelText(/description/i);
    expect(descriptionField).toHaveValue("Original description.");

    fireEvent.change(descriptionField, { target: { value: "Revised description." } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(updateConfigMock).toHaveBeenCalled());
    expect(updateConfigMock).toHaveBeenCalledWith(
      "cfg-edit",
      expect.objectContaining({ notes: "Revised description." }),
    );
  });
});

describe("Workflow list — Description / Created By rendering (workflow-metadata fix)", () => {
  beforeEach(() => {
    listByProductMock.mockClear();
  });

  it("renders the actual description and creator text for a populated workflow", async () => {
    const product = makeProduct("prod-1", "Test Product");
    listByProductMock.mockResolvedValue([
      makeConfig({
        id: "cfg-populated",
        notes: "Installs two cameras and a reverse-input harness.",
        createdBy: "Chris Chavez",
      }),
    ]);

    await renderInstructionsView(product);

    expect(await screen.findByText("Installs two cameras and a reverse-input harness.")).toBeInTheDocument();
    expect(screen.getByText("Chris Chavez")).toBeInTheDocument();
  });

  it("renders '—' for both Description and Created By on a historical/null-metadata workflow, never 'undefined'", async () => {
    const product = makeProduct("prod-1", "Test Product");
    listByProductMock.mockResolvedValue([
      makeConfig({ id: "cfg-historical", notes: undefined, createdBy: undefined }),
    ]);

    await renderInstructionsView(product);

    await screen.findByText("Test Workflow"); // the row rendered at all
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(2); // at least Description + Created By
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
  });
});
