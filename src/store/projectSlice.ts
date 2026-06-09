import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { Project } from "../types/project";
import { projectService, ProjectFilters, UpdateProjectStatusRequest } from "../services/projectService";

interface ProjectState {
  items: Project[];
  total: number;
  loading: boolean;
  error?: string;
}

const initialState: ProjectState = {
  items: [],
  total: 0,
  loading: false
};

export const fetchProjects = createAsyncThunk(
  "projects/fetch",
  async (filters?: ProjectFilters) => {
    return projectService.getProjects(filters);
  }
);

export const createProject = createAsyncThunk("projects/create", async (payload: Project) => {
  return projectService.createProject(payload);
});

export const updateProject = createAsyncThunk(
  "projects/update",
  async ({ id, payload }: { id: string; payload: Partial<Project> }) => {
    return projectService.updateProject(id, payload);
  }
);

export const updateProjectStatus = createAsyncThunk(
  "projects/updateStatus",
  async ({ id, payload }: { id: string; payload: UpdateProjectStatusRequest }) => {
    return projectService.updateProjectStatus(id, payload);
  }
);

export const deleteProject = createAsyncThunk("projects/delete", async (id: string) => {
  return projectService.deleteProject(id);
});

const projectSlice = createSlice({
  name: "projects",
  initialState,
  reducers: {
    setProjects(state, action: PayloadAction<{ items: Project[]; total: number }>) {
      state.items = action.payload.items;
      state.total = action.payload.total;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProjects.pending, (state) => {
        state.loading = true;
        state.error = undefined;
      })
      .addCase(fetchProjects.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload.items;
        state.total = action.payload.total;
      })
      .addCase(fetchProjects.rejected, (state) => {
        state.loading = false;
        state.error = "Failed to load projects";
      })
      .addCase(createProject.fulfilled, (state, action) => {
        state.items.unshift(action.payload);
      })
      .addCase(updateProject.fulfilled, (state, action) => {
        const index = state.items.findIndex((item) => item.id === action.payload.id);
        if (index >= 0) {
          state.items[index] = action.payload;
        }
      })
      .addCase(updateProjectStatus.fulfilled, (state, action) => {
        const index = state.items.findIndex((item) => item.id === action.payload.id);
        if (index >= 0) {
          state.items[index] = action.payload;
        }
      })
      .addCase(deleteProject.fulfilled, (state, action) => {
        state.items = state.items.filter((item) => item.id !== action.payload);
      });
  }
});

export const { setProjects } = projectSlice.actions;
export default projectSlice.reducer;
