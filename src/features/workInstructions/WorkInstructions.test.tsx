import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
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

vi.mock("../../services/workflowConfigService", () => ({
  workflowConfigService: {
    listByProduct: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(null),
    update: vi.fn(),
    archive: vi.fn(),
  },
}));

vi.mock("../../services/workflowTypeService", () => ({
  workflowTypeService: {
    list: vi.fn().mockResolvedValue([]),
  },
}));

import WorkInstructions from "./WorkInstructions";

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
