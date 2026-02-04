import { Checkbox, FormControlLabel, Grid, TextField } from "@mui/material";
import { FieldDefinition } from "../services/fieldService";

type Props = {
  definitions: FieldDefinition[];
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
};

const getInputType = (fieldType: string) => {
  switch (fieldType) {
    case "number":
    case "currency":
    case "percentage":
      return "number";
    case "date":
      return "date";
    case "email":
      return "email";
    case "phone":
      return "tel";
    default:
      return "text";
  }
};

const DynamicFieldsForm = ({ definitions, values, onChange }: Props) => {
  if (definitions.length === 0) return null;

  return (
    <Grid container spacing={2}>
      {definitions.map((field) => {
        const value = values[field.id] ?? "";
        if (field.fieldType === "checkbox") {
          return (
            <Grid item xs={12} md={6} key={field.id}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={value === "true"}
                    onChange={(event) =>
                      onChange({ ...values, [field.id]: event.target.checked ? "true" : "false" })
                    }
                  />
                }
                label={field.name}
              />
            </Grid>
          );
        }

        return (
          <Grid item xs={12} md={6} key={field.id}>
            <TextField
              label={field.name}
              type={getInputType(field.fieldType)}
              fullWidth
              InputLabelProps={field.fieldType === "date" ? { shrink: true } : undefined}
              value={value}
              onChange={(event) => onChange({ ...values, [field.id]: event.target.value })}
            />
          </Grid>
        );
      })}
    </Grid>
  );
};

export default DynamicFieldsForm;
