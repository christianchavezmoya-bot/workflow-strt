import { Chip } from "@mui/material";
import {
  CheckCircleOutlined,
  ErrorOutlined,
  HourglassEmptyOutlined,
  NotInterestedOutlined,
  PendingOutlined
} from "@mui/icons-material";
import type { SignatureStatus } from "../../types/signature";

const configs: Record<SignatureStatus, { label: string; color: "default" | "warning" | "info" | "success" | "error"; icon: React.ReactElement }> = {
  None:             { label: "Not Signed",         color: "default",  icon: <PendingOutlined />          },
  PendingInstaller: { label: "Pending Field Sign-off",  color: "warning",  icon: <HourglassEmptyOutlined />   },
  PendingCustomer:  { label: "Pending Customer",   color: "info",     icon: <HourglassEmptyOutlined />   },
  Signed:           { label: "Signed",             color: "success",  icon: <CheckCircleOutlined />       },
  Declined:         { label: "Declined",           color: "error",    icon: <ErrorOutlined />             },
  WaivedCustomer:   { label: "Sig. Waived",        color: "default",  icon: <NotInterestedOutlined />     }
};

interface Props {
  status: string;
  size?: "small" | "medium";
}

export default function SignatureBadge({ status, size = "small" }: Props) {
  const cfg = configs[status as SignatureStatus] ?? configs.None;
  return (
    <Chip
      icon={cfg.icon}
      label={cfg.label}
      color={cfg.color}
      size={size}
      variant="outlined"
    />
  );
}
