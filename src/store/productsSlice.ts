import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { Product } from "../types/product";
import { productService } from "../services/productService";

interface ProductsState {
  items: Product[];
  loading: boolean;
  // Set on both fulfilled and rejected — distinguishes "never fetched" from
  // "fetched and legitimately got zero items" (e.g. a fresh/minimal-seeded
  // environment with no products yet). Callers that gate a fetch-once-on-mount
  // effect on "do we already have data" must check this, not items.length —
  // gating on items.length alone means an empty-but-successful fetch never
  // looks "done", so the effect fires again every time loading cycles back to
  // false, in an unthrottled loop (see ProjectList.tsx).
  hasFetchedOnce: boolean;
  error?: string;
}

const initialState: ProductsState = {
  items: [],
  loading: false,
  hasFetchedOnce: false
};

export const fetchProducts = createAsyncThunk("products/fetch", async () => {
  return productService.getProducts();
});

export const createProduct = createAsyncThunk(
  "products/create",
  async (payload: Omit<Product, "id">) => {
    return productService.createProduct(payload);
  }
);

export const updateProduct = createAsyncThunk(
  "products/update",
  async ({ id, payload }: { id: string; payload: Partial<Product> }) => {
    return productService.updateProduct(id, payload);
  }
);

export const deleteProduct = createAsyncThunk("products/delete", async (id: string) => {
  return productService.deleteProduct(id);
});

const productsSlice = createSlice({
  name: "products",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchProducts.pending, (state) => {
        state.loading = true;
        state.error = undefined;
      })
      .addCase(fetchProducts.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
        state.hasFetchedOnce = true;
      })
      .addCase(fetchProducts.rejected, (state) => {
        state.loading = false;
        state.hasFetchedOnce = true;
        state.error = "Failed to load products";
      })
      .addCase(createProduct.fulfilled, (state, action) => {
        state.items.unshift(action.payload);
      })
      .addCase(updateProduct.fulfilled, (state, action) => {
        const index = state.items.findIndex((item) => item.id === action.payload.id);
        if (index >= 0) {
          state.items[index] = action.payload;
        }
      })
      .addCase(deleteProduct.fulfilled, (state, action) => {
        state.items = state.items.filter((item) => item.id !== action.payload);
      });
  }
});

export default productsSlice.reducer;
