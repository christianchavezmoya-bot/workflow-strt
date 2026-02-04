import { configureStore } from "@reduxjs/toolkit";
import customersReducer from "./customersSlice";
import installationsReducer from "./installationSlice";
import productsReducer from "./productsSlice";
import projectsReducer from "./projectSlice";
import usersReducer from "./usersSlice";

export const store = configureStore({
  reducer: {
    projects: projectsReducer,
    installations: installationsReducer,
    users: usersReducer,
    customers: customersReducer,
    products: productsReducer
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
