import { Box } from "@mui/material";
import GlobalOfficeMap, { Office } from "../../components/GlobalOfficeMap";

export interface AdminOfficesTabProps {
  offices: Office[];
  onAddOffice: (office: Omit<Office, "id">) => Promise<void>;
  onUpdateOffice: (id: string, office: Omit<Office, "id">) => Promise<void>;
  onDeleteOffice: (id: string) => Promise<void>;
}

export default function AdminOfficesTab({
  offices,
  onAddOffice,
  onUpdateOffice,
  onDeleteOffice,
}: AdminOfficesTabProps) {
  return (
    <Box>
      <GlobalOfficeMap
        offices={offices}
        onAddOffice={onAddOffice}
        onUpdateOffice={onUpdateOffice}
        onDeleteOffice={onDeleteOffice}
      />
    </Box>
  );
}
