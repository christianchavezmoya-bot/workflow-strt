import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
} from "@mui/material";
import type { User } from "../../types/user";

type Props = {
  open: boolean;
  saving: boolean;
  assetCount: number;
  users: User[];
  selectedUserId: string;
  onClose: () => void;
  onUserChange: (userId: string) => void;
  onApply: () => void;
};

export default function AssetInstallationBulkTechAssignDialog({
  open,
  saving,
  assetCount,
  users,
  selectedUserId,
  onClose,
  onUserChange,
  onApply,
}: Props) {
  return (
    <Dialog open={open} onClose={() => !saving && onClose()} maxWidth="xs" fullWidth>
      <DialogTitle>
        Assign user to {assetCount} asset{assetCount !== 1 ? "s" : ""}
      </DialogTitle>
      <DialogContent>
        <FormControl fullWidth sx={{ mt: 1 }}>
          <InputLabel shrink>User</InputLabel>
          <Select label="User" value={selectedUserId} onChange={(e) => onUserChange(e.target.value)}>
            <MenuItem value="">(Unassign)</MenuItem>
            {users.filter((user) => user.isActive).map((user) => (
              <MenuItem key={user.id} value={user.id}>
                {user.fullName}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" disabled={saving} onClick={onApply}>
          {saving ? "Saving..." : "Apply"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
