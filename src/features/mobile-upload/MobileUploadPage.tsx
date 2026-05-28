import { useEffect, useRef, useState } from "react";
import {
  Box, Button, CircularProgress, LinearProgress,
  Stack, Typography, Alert, Paper,
} from "@mui/material";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { useSearchParams } from "react-router-dom";
import api from "../../services/api";

interface TokenInfo {
  type: string;
  linkedTo: string;
  expiresAt: string;
  error?: string;
}

type PageState = "loading" | "ready" | "uploading" | "done" | "error";

export default function MobileUploadPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [pageState, setPageState] = useState<PageState>("loading");
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) {
      setErrorMsg("No upload token found in URL.");
      setPageState("error");
      return;
    }
    api.get<TokenInfo>(`/mobile-upload/${token}/info`)
      .then((res) => {
        if (res.data.error === "expired") {
          setErrorMsg("This QR code has expired. Please ask for a new one on the desktop.");
          setPageState("error");
        } else {
          setTokenInfo(res.data);
          setPageState("ready");
        }
      })
      .catch(() => {
        setErrorMsg("Upload link is invalid or has expired.");
        setPageState("error");
      });
  }, [token]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    if (file.type.startsWith("image/")) {
      setPreview(URL.createObjectURL(file));
    } else {
      setPreview(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !token) return;
    setPageState("uploading");
    setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      await api.post(`/mobile-upload/${token}/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          if (e.total) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      setPageState("done");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed. Please try again.";
      setErrorMsg(msg);
      setPageState("error");
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "background.default",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
      }}
    >
      <Paper variant="outlined" sx={{ width: "100%", maxWidth: 420, p: 3 }}>
        {/* Header */}
        <Stack spacing={0.5} mb={3}>
          <Typography variant="h6" fontWeight={700}>Upload from Phone</Typography>
          {tokenInfo && (
            <Typography variant="caption" color="text.secondary">
              To: {tokenInfo.linkedTo || tokenInfo.type}
            </Typography>
          )}
        </Stack>

        {/* Loading */}
        {pageState === "loading" && (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        )}

        {/* Error */}
        {pageState === "error" && (
          <Alert severity="error" icon={<ErrorOutlineIcon />}>
            {errorMsg ?? "Something went wrong."}
          </Alert>
        )}

        {/* Done */}
        {pageState === "done" && (
          <Stack alignItems="center" spacing={2} py={3}>
            <CheckCircleOutlineIcon sx={{ fontSize: 64, color: "success.main" }} />
            <Typography variant="h6" fontWeight={700} color="success.main">
              Upload complete!
            </Typography>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              Your file has been received. You can close this tab.
            </Typography>
          </Stack>
        )}

        {/* Uploading progress */}
        {pageState === "uploading" && (
          <Stack spacing={2} py={2}>
            <Typography variant="body2" textAlign="center">Uploading...</Typography>
            <LinearProgress variant="determinate" value={uploadProgress} sx={{ borderRadius: 1, height: 8 }} />
            <Typography variant="caption" color="text.secondary" textAlign="center">
              {uploadProgress}%
            </Typography>
          </Stack>
        )}

        {/* Ready â€” file picker */}
        {pageState === "ready" && (
          <Stack spacing={2}>
            {/* Drop zone / file picker */}
            <Box
              onClick={() => fileInputRef.current?.click()}
              sx={{
                border: "2px dashed",
                borderColor: selectedFile ? "success.main" : "divider",
                borderRadius: 2,
                p: 3,
                textAlign: "center",
                cursor: "pointer",
                bgcolor: selectedFile ? "success.50" : "action.hover",
                transition: "all 0.2s",
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,application/pdf,.dwg"
                style={{ display: "none" }}
                onChange={handleFileChange}
                capture={undefined}
              />
              {selectedFile ? (
                <Stack spacing={1} alignItems="center">
                  {preview && (
                    <Box
                      component="img"
                      src={preview}
                      sx={{ maxHeight: 160, maxWidth: "100%", borderRadius: 1, objectFit: "contain" }}
                    />
                  )}
                  <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 260 }}>
                    {selectedFile.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatBytes(selectedFile.size)} • Tap to change
                  </Typography>
                </Stack>
              ) : (
                <Stack spacing={1} alignItems="center">
                  <UploadFileOutlinedIcon sx={{ fontSize: 48, color: "text.disabled" }} />
                  <Typography variant="body2" fontWeight={600}>Tap to choose a file</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Photo, video, PDF or drawing
                  </Typography>
                </Stack>
              )}
            </Box>

            <Button
              variant="contained"
              size="large"
              fullWidth
              disabled={!selectedFile}
              onClick={handleUpload}
              startIcon={<UploadFileOutlinedIcon />}
            >
              Upload
            </Button>
          </Stack>
        )}
      </Paper>
    </Box>
  );
}
