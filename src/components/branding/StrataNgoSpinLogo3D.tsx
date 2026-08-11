import { Box, keyframes } from "@mui/material";

/** Y-axis spin only — horizontal axis, no tilt. */
const spinHorizontal = keyframes`
  from { transform: rotateY(0deg); }
  to { transform: rotateY(360deg); }
`;

const BLUE_FRONT = "#0099D8";
const GREY_FRONT = "#5C6670";
const DEPTH_PX = 14;
const SLICE_COUNT = 13;

/** Matches original STRATA N-GO lockup proportions (symbol + wordmark). */
const VIEWBOX_W = 260;
const VIEWBOX_H = 210;

function mixHex(hex: string, toward: string, amount: number): string {
  const parse = (value: string) => {
    const raw = value.replace("#", "");
    return [
      parseInt(raw.slice(0, 2), 16),
      parseInt(raw.slice(2, 4), 16),
      parseInt(raw.slice(4, 6), 16),
    ] as const;
  };
  const [r1, g1, b1] = parse(hex);
  const [r2, g2, b2] = parse(toward);
  const t = Math.min(1, Math.max(0, amount));
  const channel = (from: number, to: number) => Math.round(from + (to - from) * t);
  const r = channel(r1, r2);
  const g = channel(g1, g2);
  const b = channel(b1, b2);
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

type FaceProps = {
  /** 0 = back slice, 1 = front slice */
  depthT: number;
  emphasize?: boolean;
};

function StrataNgoLogoFace({ depthT, emphasize = false }: FaceProps) {
  const shade = emphasize ? 1 : 0.38 + depthT * 0.52;
  const blue = mixHex(BLUE_FRONT, "#062636", 1 - shade);
  const grey = mixHex(GREY_FRONT, "#111820", 1 - shade);

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
      width="100%"
      height="100%"
      aria-hidden
      style={{ display: "block" }}
    >
      {/*
        Original mark = exactly two blue shapes:
        1) Centered peak with a slightly convex base
        2) Wide upward arch beneath, tapering to points at the sides
      */}
      <path
        d="M 130 8 L 176 44 Q 130 40 84 44 Z"
        fill={blue}
      />
      <path
        d="M 22 66 Q 130 52 238 66 L 232 74 Q 130 60 28 74 Z"
        fill={blue}
      />

      <text
        x="130"
        y="112"
        textAnchor="middle"
        fill={grey}
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight={700}
        fontSize="38"
        letterSpacing="4"
      >
        STRATA
      </text>
      <text
        x="130"
        y="144"
        textAnchor="middle"
        fill={grey}
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight={700}
        fontSize="19"
        letterSpacing="6"
      >
        N-GO
      </text>
    </svg>
  );
}

type Props = {
  width?: number | { xs: number; sm: number };
  height?: number | { xs: number; sm: number };
};

/**
 * Extruded STRATA N-GO mark that spins on the horizontal (Y) axis with visible depth.
 */
export default function StrataNgoSpinLogo3D({
  width = { xs: 148, sm: 168 },
  height = { xs: 120, sm: 136 },
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
        perspective: 960,
        perspectiveOrigin: "center center",
        width,
        height,
        aspectRatio: `${VIEWBOX_W} / ${VIEWBOX_H}`,
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

        {/* Back face — readable when the logo spins past 180° */}
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            transform: `rotateY(180deg) translateZ(${halfDepth}px)`,
            backfaceVisibility: "hidden",
            pointerEvents: "none",
            opacity: 0.84,
          }}
        >
          <StrataNgoLogoFace depthT={0} emphasize />
        </Box>
      </Box>
    </Box>
  );
}
