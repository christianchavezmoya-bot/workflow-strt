import { configureStore } from "@reduxjs/toolkit";
import customersReducer from "./customersSlice";
import installationsReducer from "./installationSlice";
import productsReducer from "./productsSlice";
import projectsReducer from "./projectSlice";
import usersReducer, { fetchUsers } from "./usersSlice";

export const store = configureStore({
  reducer: {
    projects: projectsReducer,
    installations: installationsReducer,
    users: usersReducer,
    customers: customersReducer,
    products: productsReducer
  }
});

// userService serves its cached list immediately and refreshes in the
// background. It fires `repo:users:updated` when that refresh brings CHANGED
// data; without re-reading here, every screen that dispatched fetchUsers() once
// on mount would keep showing the pre-refresh list until a manual reload.
//
// Registered once, centrally, rather than in each of the ~7 screens that
// dispatch fetchUsers. Safe from looping because the event only fires on a real
// change: the refetch this triggers finds identical data and emits nothing.
if (typeof window !== "undefined") {
  window.addEventListener("repo:users:updated", () => {
    void store.dispatch(fetchUsers());
  });
}

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
