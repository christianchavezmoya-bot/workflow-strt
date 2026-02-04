import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { Customer } from "../types/customer";
import { customerService } from "../services/customerService";

interface CustomersState {
  items: Customer[];
  loading: boolean;
  error?: string;
}

const initialState: CustomersState = {
  items: [],
  loading: false
};

export const fetchCustomers = createAsyncThunk("customers/fetch", async () => {
  return customerService.getCustomers();
});

export const createCustomer = createAsyncThunk(
  "customers/create",
  async (payload: Omit<Customer, "id">) => {
    return customerService.createCustomer(payload);
  }
);

export const updateCustomer = createAsyncThunk(
  "customers/update",
  async ({ id, payload }: { id: string; payload: Partial<Customer> }) => {
    return customerService.updateCustomer(id, payload);
  }
);

export const deleteCustomer = createAsyncThunk("customers/delete", async (id: string) => {
  return customerService.deleteCustomer(id);
});

const customersSlice = createSlice({
  name: "customers",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchCustomers.pending, (state) => {
        state.loading = true;
        state.error = undefined;
      })
      .addCase(fetchCustomers.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
      })
      .addCase(fetchCustomers.rejected, (state) => {
        state.loading = false;
        state.error = "Failed to load customers";
      })
      .addCase(createCustomer.fulfilled, (state, action) => {
        state.items.unshift(action.payload);
      })
      .addCase(updateCustomer.fulfilled, (state, action) => {
        const index = state.items.findIndex((item) => item.id === action.payload.id);
        if (index >= 0) {
          state.items[index] = action.payload;
        }
      })
      .addCase(deleteCustomer.fulfilled, (state, action) => {
        state.items = state.items.filter((item) => item.id !== action.payload);
      });
  }
});

export default customersSlice.reducer;
