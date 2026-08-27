import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#2dd4bf"
    },
    secondary: {
      main: "#ff9f45"
    },
    success: {
      main: "#2e9b5e"
    },
    warning: {
      main: "#d79b24"
    },
    info: {
      main: "#3aa1ff"
    },
    background: {
      default: "#0b1d24",
      paper: "#0f1c22"
    }
  },
  typography: {
    fontFamily: "Manrope, Sora, system-ui, sans-serif",
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 }
  },
  shape: {
    borderRadius: 12
  },
  components: {
    MuiDialog: {
      defaultProps: {
        // Native file pickers return focus to the triggering button while the modal
        // backdrop still marks #root aria-hidden — Chrome blocks interaction until
        // focus moves. Avoid restoring focus to the hidden control on close/picker return.
        disableRestoreFocus: true,
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          borderRadius: 10
        }
      }
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          color: "#e4edf2"
        }
      }
    }
  }
});

export default theme;
