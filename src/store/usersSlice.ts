import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { User } from "../types/user";
import { CreateUserPayload, UpdateUserPayload, userService } from "../services/userService";

interface UsersState {
  items: User[];
  loading: boolean;
  error?: string;
}

const initialState: UsersState = {
  items: [],
  loading: false
};

export const fetchUsers = createAsyncThunk("users/fetch", async () => {
  return userService.getUsers();
});

export const createUser = createAsyncThunk(
  "users/create",
  async (payload: CreateUserPayload) => {
    return userService.createUser(payload);
  }
);

export const updateUser = createAsyncThunk(
  "users/update",
  async ({ id, payload }: { id: string; payload: UpdateUserPayload }) => {
    return userService.updateUser(id, payload);
  }
);

export const deactivateUser = createAsyncThunk("users/deactivate", async (id: string) => {
  return userService.deactivateUser(id);
});

export const inviteUser = createAsyncThunk("users/invite", async (id: string) => {
  await userService.inviteUser(id);
  return id;
});

export const deleteUser = createAsyncThunk("users/delete", async (id: string) => {
  return userService.deleteUser(id);
});

const usersSlice = createSlice({
  name: "users",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchUsers.pending, (state) => {
        state.loading = true;
        state.error = undefined;
      })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
      })
      .addCase(fetchUsers.rejected, (state) => {
        state.loading = false;
        state.error = "Failed to load users";
      })
      .addCase(createUser.fulfilled, (state, action) => {
        state.items.unshift(action.payload);
      })
      .addCase(updateUser.fulfilled, (state, action) => {
        const index = state.items.findIndex((item) => item.id === action.payload.id);
        if (index >= 0) {
          state.items[index] = action.payload;
        }
      })
      .addCase(deactivateUser.fulfilled, (state, action) => {
        const index = state.items.findIndex((item) => item.id === action.payload.id);
        if (index >= 0) {
          state.items[index] = action.payload;
        }
      })
      .addCase(deleteUser.fulfilled, (state, action) => {
        state.items = state.items.filter((item) => item.id !== action.payload);
      });
  }
});

export default usersSlice.reducer;
