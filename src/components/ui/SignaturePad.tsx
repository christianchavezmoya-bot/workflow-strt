import { useEffect, useRef } from "react";
import { Box, Button, Typography } from "@mui/material";

interface Props {
  /** Called with a base64 PNG data-URL whenever the pad changes, or null after clear. */
  onChange: (dataUrl: string | null) => void;
  height?: number;
  label?: string;
}

/**
 * Touch-and-mouse friendly HTML-canvas signature pad.
 * No external library — uses raw canvas 2D events.
 */
export default function SignaturePad({ onChange, height = 140, label }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing   = useRef(false);
  const hasDrawn  = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";

    const pos = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const src  = "touches" in e ? e.touches[0] : e;
      // Scale for device pixel ratio / CSS vs canvas coordinate mismatch
      const scaleX = canvas.width  / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (src.clientX - rect.left) * scaleX,
        y: (src.clientY - rect.top)  * scaleY,
      };
    };

    const onStart = (e: MouseEvent | TouchEvent) => {
      drawing.current = true;
      const { x, y } = pos(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
      e.preventDefault();
    };

    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!drawing.current) return;
      const { x, y } = pos(e);
      ctx.lineTo(x, y);
      ctx.stroke();
      hasDrawn.current = true;
      e.preventDefault();
    };

    const onEnd = () => {
      if (!drawing.current) return;
      drawing.current = false;
      if (hasDrawn.current) onChange(canvas.toDataURL("image/png"));
    };

    canvas.addEventListener("mousedown",  onStart);
    canvas.addEventListener("mousemove",  onMove);
    canvas.addEventListener("mouseup",    onEnd);
    canvas.addEventListener("mouseleave", onEnd);
    canvas.addEventListener("touchstart", onStart, { passive: false });
    canvas.addEventListener("touchmove",  onMove,  { passive: false });
    canvas.addEventListener("touchend",   onEnd);

    return () => {
      canvas.removeEventListener("mousedown",  onStart);
      canvas.removeEventListener("mousemove",  onMove);
      canvas.removeEventListener("mouseup",    onEnd);
      canvas.removeEventListener("mouseleave", onEnd);
      canvas.removeEventListener("touchstart", onStart);
      canvas.removeEventListener("touchmove",  onMove);
      canvas.removeEventListener("touchend",   onEnd);
    };
  }, [onChange]);

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawn.current = false;
    onChange(null);
  };

  return (
    <Box>
      {label && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
          {label}
        </Typography>
      )}
      <canvas
        ref={canvasRef}
        width={600}
        height={height * 2}   /* 2× internal res for crisp rendering */
        style={{
          width: "100%",
          height,
          display: "block",
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.2)",
          borderRadius: 4,
          cursor: "crosshair",
          touchAction: "none",
        }}
      />
      <Button size="small" onClick={clear} sx={{ mt: 0.5, fontSize: "0.72rem" }}>
        Clear
      </Button>
    </Box>
  );
}
