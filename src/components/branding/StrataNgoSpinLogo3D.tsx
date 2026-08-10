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
      viewBox="0 0 240 132"
      width="100%"
      height="100%"
      aria-hidden
      style={{ display: "block" }}
    >
      {/* Blue mountain / wave mark — three stacked tiers */}
      <path
        d="M 42 51 Q 120 41 198 51 L 198 55 Q 120 45 42 55 Z"
        fill={blue}
      />
      <path
        d="M 60 42 Q 120 32 180 42 L 180 45 Q 120 35 60 45 Z"
        fill={blue}
      />
      <path
        d="M 90 39 Q 120 11 150 39 Q 120 24 90 39 Z"
        fill={blue}
      />

      <text
        x="120"
        y="82"
        textAnchor="middle"
        fill={grey}
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight={700}
        fontSize="34"
        letterSpacing="3"
      >
        STRATA
      </text>
      <text
        x="120"
        y="104"
        textAnchor="middle"
        fill={grey}
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight={700}
        fontSize="17"
        letterSpacing="5"
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
  height = { xs: 82, sm: 92 },
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
