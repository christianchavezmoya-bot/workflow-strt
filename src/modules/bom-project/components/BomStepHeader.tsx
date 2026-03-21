import { Box, Step, StepLabel, Stepper, Typography } from "@mui/material";

const STEPS = ["Upload File", "Map Columns", "Review Items", "Create Project"];

interface Props {
  activeStep: 0 | 1 | 2 | 3;
  title: string;
  subtitle?: string;
}

export default function BomStepHeader({ activeStep, title, subtitle }: Props) {
  return (
    <Box mb={3}>
      <Stepper activeStep={activeStep} sx={{ mb: 2.5 }}>
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>
      <Typography variant="h5" fontWeight={700}>{title}</Typography>
      {subtitle && (
        <Typography variant="body2" color="text.secondary" mt={0.5}>{subtitle}</Typography>
      )}
    </Box>
  );
}
