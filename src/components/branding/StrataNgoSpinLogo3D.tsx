import { Box, keyframes } from "@mui/material";

/** Horizontal-axis spin only. */
const spinHorizontal = keyframes`
  from { transform: rotateY(0deg); }
  to { transform: rotateY(360deg); }
`;

const VIDEO_ASPECT_RATIO = "1920 / 1080";

type Props = {
  width?: number | { xs: number; sm: number };
  height?: number | { xs: number; sm: number };
};

/**
 * Mobile sync overlay logo.
 * Uses the provided transparent WebM and preserves its natural 16:9 ratio.
 */
export default function StrataNgoSpinLogo3D({
  width = { xs: 132, sm: 148 },
  height,
}: Props) {
  return (
    <Box
      sx={{
        perspective: 960,
        perspectiveOrigin: "center center",
        width,
        height: height ?? "auto",
        aspectRatio: VIDEO_ASPECT_RATIO,
      }}
    >
      <Box
        sx={{
          position: "relative",
          width: "100%",
          height: "100%",
          transformStyle: "preserve-3d",
          animation: `${spinHorizontal} 1.15s linear infinite`,
          willChange: "transform",
        }}
      >
        <Box
          component="video"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          aria-hidden
          src="/sync-logo-transparent.webm"
          sx={{
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: "contain",
            backgroundColor: "transparent",
            backfaceVisibility: "visible",
            pointerEvents: "none",
          }}
        />
      </Box>
    </Box>
  );
}
