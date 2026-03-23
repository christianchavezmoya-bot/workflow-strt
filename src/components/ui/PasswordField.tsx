import { useState } from "react";
import { IconButton, InputAdornment, TextField } from "@mui/material";
import type { TextFieldProps } from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";

/**
 * TextField wrapper that adds a show/hide eye toggle for password inputs.
 * All standard TextField props are forwarded.
 */
export default function PasswordField(props: TextFieldProps) {
  const [show, setShow] = useState(false);

  return (
    <TextField
      {...props}
      type={show ? "text" : "password"}
      InputProps={{
        ...props.InputProps,
        endAdornment: (
          <InputAdornment position="end">
            <IconButton
              onClick={() => setShow((s) => !s)}
              edge="end"
              aria-label={show ? "Hide password" : "Show password"}
              size="small"
            >
              {show ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
            </IconButton>
          </InputAdornment>
        ),
      }}
    />
  );
}
