import { useRef, useState } from "react";
import { Box, Typography, Button, LinearProgress, alpha } from "@mui/material";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";

interface Props {
  onFile: (file: File) => void;
  loading?: boolean;
  accept?: string;
}

export default function UploadDropzone({
  onFile,
  loading = false,
  accept = ".xlsx,.xls,.csv",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    onFile(files[0]);
  };

  return (
    <Box
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      sx={{
        border: "2px dashed",
        borderColor: dragging ? "primary.main" : "divider",
        borderRadius: 2,
        p: 6,
        textAlign: "center",
        bgcolor: dragging ? (t) => alpha(t.palette.primary.main, 0.05) : "background.paper",
        cursor: "pointer",
        transition: "all 0.2s",
        "&:hover": { borderColor: "primary.main", bgcolor: (t) => alpha(t.palette.primary.main, 0.03) },
      }}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: "none" }}
        onChange={(e) => handleFiles(e.target.files)}
      />
      <UploadFileOutlinedIcon sx={{ fontSize: 48, color: "primary.main", mb: 1 }} />
      <Typography variant="h6" gutterBottom>
        Drop your BOM file here
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Supports .xlsx, .xls, .csv
      </Typography>
      <Button variant="outlined" size="small" sx={{ mt: 1 }}
        onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>
        Browse File
      </Button>
      {loading && <LinearProgress sx={{ mt: 2 }} />}
    </Box>
  );
}
