import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { Installation } from "../types/installation";
import { installationService } from "../services/installationService";

interface InstallationState {
  items: Installation[];
  loading: boolean;
  error?: string;
}

const initialState: InstallationState = {
  items: [],
  loading: false
};

export const fetchInstallations = createAsyncThunk(
  "installations/fetch",
  async (params?: { projectId?: string; includeDeleted?: boolean }) => {
    return installationService.getInstallations(params?.projectId, params?.includeDeleted);
  }
);

export const createInstallation = createAsyncThunk(
  "installations/create",
  async (payload: Installation) => {
    return installationService.createInstallation(payload);
  }
);

export const updateInstallation = createAsyncThunk(
  "installations/update",
  async ({ id, payload }: { id: string; payload: Installation }) => {
    return installationService.updateInstallation(id, payload);
  }
);

export const deleteInstallation = createAsyncThunk(
  "installations/delete",
  async (id: string) => {
    return installationService.deleteInstallation(id);
  }
);

const installationSlice = createSlice({
  name: "installations",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchInstallations.pending, (state) => {
        state.loading = true;
        state.error = undefined;
      })
      .addCase(fetchInstallations.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
      })
      .addCase(fetchInstallations.rejected, (state) => {
        state.loading = false;
        state.error = "Failed to load installations";
      })
      .addCase(createInstallation.fulfilled, (state, action) => {
        state.items.unshift(action.payload);
      })
      .addCase(updateInstallation.fulfilled, (state, action) => {
        const index = state.items.findIndex((item) => item.id === action.payload.id);
        if (index >= 0) {
          state.items[index] = action.payload;
        }
      })
      .addCase(deleteInstallation.fulfilled, (state, action) => {
        state.items = state.items.filter((item) => item.id !== action.payload);
      });
  }
});

export default installationSlice.reducer;
