import { Box, Typography } from "@mui/material";

type Props = {
  value: number;
  size?: number;
  color?: string;
};

export default function DashboardGaugeCircle({ value, size = 80, color = "primary.main" }: Props) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;
  return (
    <Box sx={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={7} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={7}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ color: color === "primary.main" ? "#2dd4bf" : color }}
        />
      </svg>
      <Typography
        variant="caption"
        fontWeight={700}
        sx={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: size > 70 ? "1rem" : "0.75rem",
        }}
      >
        {value}%
      </Typography>
    </Box>
  );
}
