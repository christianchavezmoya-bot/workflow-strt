import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { Product } from "../types/product";
import { productService } from "../services/productService";

interface ProductsState {
  items: Product[];
  loading: boolean;
  error?: string;
}

const initialState: ProductsState = {
  items: [],
  loading: false
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
      })
      .addCase(fetchProducts.rejected, (state) => {
        state.loading = false;
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
