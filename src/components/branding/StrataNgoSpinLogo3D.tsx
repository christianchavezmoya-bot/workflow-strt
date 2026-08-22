import { Box, keyframes } from "@mui/material";
import strataNgoLogo from "../../assets/strata-ngo-transparent.png";

/** Rotate the whole extruded mark around the horizontal X-axis (front → edge → back → edge). */
const spinHorizontalX = keyframes`
  from { transform: rotateX(0deg); }
  to { transform: rotateX(360deg); }
`;

const DEPTH_PX = 16;
const SLICE_COUNT = 15;

/** Source PNG dimensions — preserve aspect ratio exactly. */
const LOGO_ASPECT = `${1254} / ${826}`;

type FaceProps = {
  /** 0 = back slice, 1 = front slice */
  depthT: number;
  emphasize?: boolean;
};

function StrataNgoLogoFace({ depthT, emphasize = false }: FaceProps) {
  const shade = emphasize ? 1 : 0.42 + depthT * 0.5;
  const brightness = 0.55 + shade * 0.45;

  return (
    <Box
      component="img"
      src={strataNgoLogo}
      alt=""
      aria-hidden
      draggable={false}
      sx={{
        display: "block",
        width: "100%",
        height: "100%",
        objectFit: "contain",
        objectPosition: "center",
        filter: emphasize ? "none" : `brightness(${brightness})`,
        userSelect: "none",
        WebkitUserDrag: "none",
      }}
    />
  );
}

type Props = {
  width?: number | { xs: number; sm: number };
  height?: number | { xs: number; sm: number };
};

/**
 * Extruded STRATA N-GO mark sourced from the brand PNG.
 * Spins as one rigid body on the horizontal X-axis with a transparent background.
 */
export default function StrataNgoSpinLogo3D({
  width = { xs: 132, sm: 148 },
  height,
}: Props) {
  const halfDepth = DEPTH_PX / 2;
  const slices = Array.from({ length: SLICE_COUNT }, (_, index) => {
    const depthT = index / (SLICE_COUNT - 1);
    const z = depthT * DEPTH_PX - halfDepth;
    return { id: index, depthT, z };
  });

  return (
    <Box
      sx={{
        perspective: 2400,
        perspectiveOrigin: "center center",
        width,
        height: height ?? "auto",
        aspectRatio: LOGO_ASPECT,
        bgcolor: "transparent",
      }}
    >
      <Box
        sx={{
          position: "relative",
          width: "100%",
          height: "100%",
          transformStyle: "preserve-3d",
          transformOrigin: "center center",
          animation: `${spinHorizontalX} 1.15s linear infinite`,
          willChange: "transform",
        }}
      >
        {slices.map(({ id, depthT, z }) => (
          <Box
            key={id}
            sx={{
              position: "absolute",
              inset: 0,
              transform: `translateZ(${z}px)`,
              backfaceVisibility: "hidden",
              pointerEvents: "none",
            }}
          >
            <StrataNgoLogoFace depthT={depthT} emphasize={id === SLICE_COUNT - 1} />
          </Box>
        ))}

        <Box
          sx={{
            position: "absolute",
            inset: 0,
            transform: `rotateY(180deg) translateZ(${halfDepth}px)`,
            backfaceVisibility: "hidden",
            pointerEvents: "none",
            opacity: 0.88,
          }}
        >
          <StrataNgoLogoFace depthT={0} emphasize />
        </Box>
      </Box>
    </Box>
  );
}
