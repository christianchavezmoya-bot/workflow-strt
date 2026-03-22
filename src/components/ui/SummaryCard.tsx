import { Box, Typography } from "@mui/material";

interface SummaryCardProps {
  title: string;
  value: string;
  trend: string;
}

const SummaryCard = ({ title, value, trend }: SummaryCardProps) => {
  return (
    <Box className="glass-card" sx={{ padding: 2, height: "100%" }}>
      <Typography variant="overline" color="text.secondary">
        {title}
      </Typography>
      <Typography variant="h4" sx={{ fontFamily: "Sora", marginTop: 1 }}>
        {value}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {trend}
      </Typography>
    </Box>
  );
};

export default SummaryCard;
