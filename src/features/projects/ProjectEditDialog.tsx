import { Box, Dialog, DialogContent, DialogTitle } from "@mui/material";
import ProjectForm from "./ProjectForm";
import type { Project } from "../../types/project";

type Props = {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onSaved: (saved: Project) => void | Promise<void>;
};

export default function ProjectEditDialog({ open, projectId, onClose, onSaved }: Props) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        className: "glass-card",
        sx: { backgroundColor: "var(--panel)", border: "1px solid var(--stroke)", minHeight: "80vh" },
      }}
    >
      <DialogTitle>Edit project</DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        <Box sx={{ p: 3 }}>
          <ProjectForm embedded projectId={projectId} onClose={onClose} onSaved={onSaved} />
        </Box>
      </DialogContent>
    </Dialog>
  );
}
