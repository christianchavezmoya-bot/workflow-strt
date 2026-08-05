import { createTheme } from "@mui/material/styles";

/** Light theme scoped to the capture spreadsheet so it stays readable inside the dark app shell. */
export const captureSpreadsheetTheme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#224F88" },
    secondary: { main: "#5B6576" },
    text: {
      primary: "#163447",
      secondary: "#5a6b7a",
    },
    background: {
      default: "#F7FAFD",
      paper: "#FFFFFF",
    },
  },
  typography: {
    fontFamily: "Manrope, Sora, system-ui, sans-serif",
  },
  components: {
    MuiTableCell: {
      styleOverrides: {
        root: {
          color: "#163447",
          borderBottom: "1px solid #D8DEE7",
        },
      },
    },
    MuiCheckbox: {
      styleOverrides: {
        root: {
          color: "#224F88",
          "&.Mui-checked, &.MuiCheckbox-indeterminate": {
            color: "#224F88",
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { textTransform: "none" },
        outlined: {
          color: "#224F88",
          borderColor: "#224F88",
          "&:hover": {
            borderColor: "#163447",
            backgroundColor: "rgba(34, 79, 136, 0.06)",
          },
        },
        text: {
          color: "#224F88",
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: { color: "#163447" },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { color: "inherit" },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: "#FFFFFF",
          color: "#163447",
          "& fieldset": { borderColor: "#C5D0DC" },
          "&:hover fieldset": { borderColor: "#224F88" },
          "&.Mui-focused fieldset": { borderColor: "#224F88" },
        },
        input: {
          color: "#163447",
          "&::placeholder": { color: "#5a6b7a", opacity: 1 },
        },
      },
    },
  },
});
