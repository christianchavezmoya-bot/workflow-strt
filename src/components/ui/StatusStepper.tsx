import { Box, Step, StepLabel, Stepper, Typography } from "@mui/material";
import { ProjectStatus, ProjectType } from "../../types/project";
import { getStepsForType } from "../../utils/status";

interface StatusStepperProps {
  type: ProjectType;
  status: ProjectStatus;
}

const StatusStepper = ({ type, status }: StatusStepperProps) => {
  const steps = getStepsForType(type);
  const activeStep = steps.indexOf(status);

  return (
    <Box className="glass-card" sx={{ padding: 3 }}>
      <Typography variant="h6" sx={{ marginBottom: 2 }}>
        Project workflow
      </Typography>
      <Stepper activeStep={activeStep < 0 ? 0 : activeStep} alternativeLabel>
        {steps.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>
    </Box>
  );
};

export default StatusStepper;
