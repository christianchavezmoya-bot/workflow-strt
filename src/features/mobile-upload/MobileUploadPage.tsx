import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  LinearProgress,
  Paper,
  Stack,
  Typography,
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
  status?: string;
  error?: string;
  runId?: string;
  assetId?: string;
  assetTag?: string;
  workflowName?: string;
  allMediaSteps?: MissingMediaStep[];
  missingSteps?: MissingMediaStep[];
}

interface MissingMediaStep {
  stepId: string;
  stepOrder: number;
  stepTitle: string;
  stepDescription?: string;
  inputId: string;
  inputLabel: string;
  inputType: "photo" | "video";
  captured: number;
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
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File | null>>({});
  const [previews, setPreviews] = useState<Record<string, string | null>>({});
  const galleryInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const cameraInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

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
          return;
        }

        setTokenInfo(res.data);
        setPageState("ready");
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
      return;
    }

    setPreview(null);
  };

  const handleMissingMediaFileChange = (step: MissingMediaStep, file: File | null) => {
    if (!file) return;
    const key = `${step.stepId}-${step.inputId}`;
    setSelectedFiles((prev) => ({ ...prev, [key]: file }));
    if (file.type.startsWith("image/")) {
      setPreviews((prev) => ({ ...prev, [key]: URL.createObjectURL(file) }));
      return;
    }
    setPreviews((prev) => ({ ...prev, [key]: null }));
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
          if (e.total) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        },
      });

      setPageState("done");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed. Please try again.";
      setErrorMsg(msg);
      setPageState("error");
    }
  };

  const handleMissingMediaUpload = async () => {
    if (!tokenInfo?.missingSteps?.length) return;
    const chosen = tokenInfo.missingSteps
      .map((step) => ({ step, file: selectedFiles[`${step.stepId}-${step.inputId}`] }))
      .filter((entry): entry is { step: MissingMediaStep; file: File } => Boolean(entry.file));

    if (chosen.length === 0) return;

    setPageState("uploading");
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append("itemsJson", JSON.stringify(chosen.map(({ step }) => ({
        stepId: step.stepId,
        inputId: step.inputId,
      }))));
      chosen.forEach(({ file }) => formData.append("files", file));

      await api.post(`/mobile-upload/${token}/missing-media`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          if (e.total) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
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
        <Stack spacing={0.5} mb={3}>
          <Typography variant="h6" fontWeight={700}>Upload from Phone</Typography>
          {tokenInfo && (
            <Typography variant="caption" color="text.secondary">
              To: {tokenInfo.linkedTo || tokenInfo.type}
            </Typography>
          )}
        </Stack>

        {pageState === "loading" && (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        )}

        {pageState === "error" && (
          <Alert severity="error" icon={<ErrorOutlineIcon />}>
            {errorMsg ?? "Something went wrong."}
          </Alert>
        )}

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

        {pageState === "uploading" && (
          <Stack spacing={2} py={2}>
            <Typography variant="body2" textAlign="center">Uploading...</Typography>
            <LinearProgress variant="determinate" value={uploadProgress} sx={{ borderRadius: 1, height: 8 }} />
            <Typography variant="caption" color="text.secondary" textAlign="center">
              {uploadProgress}%
            </Typography>
          </Stack>
        )}

        {pageState === "ready" && (
          <Stack spacing={2}>
            {tokenInfo?.type === "missing-media" ? (
              <>
                <Alert severity="info">
                  Upload the exact missing photos or videos for <strong>{tokenInfo.assetTag || tokenInfo.linkedTo}</strong>.
                </Alert>
                {(tokenInfo.missingSteps ?? []).map((step) => {
                  const key = `${step.stepId}-${step.inputId}`;
                  const chosenFile = selectedFiles[key];
                  const previewUrl = previews[key];
                  const accept = step.inputType === "video" ? "video/*" : "image/*";
                  return (
                    <Paper key={key} variant="outlined" sx={{ p: 2 }}>
                      <Stack spacing={1.25}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="caption" color="text.secondary">
                            Step {step.stepOrder}
                          </Typography>
                          <Typography variant="body2" fontWeight={700}>
                            {step.stepTitle}
                          </Typography>
                        </Stack>
                        {step.stepDescription && (
                          <Typography variant="caption" color="text.secondary">
                            {step.stepDescription}
                          </Typography>
                        )}
                        <Typography variant="body2" fontWeight={600}>
                          {step.inputLabel}
                        </Typography>
                        <input
                          hidden
                          ref={(el) => { galleryInputRefs.current[key] = el; }}
                          type="file"
                          accept={accept}
                          onChange={(e) => handleMissingMediaFileChange(step, e.target.files?.[0] ?? null)}
                        />
                        <input
                          hidden
                          ref={(el) => { cameraInputRefs.current[key] = el; }}
                          type="file"
                          accept={accept}
                          capture="environment"
                          onChange={(e) => handleMissingMediaFileChange(step, e.target.files?.[0] ?? null)}
                        />
                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                          <Button
                            variant="outlined"
                            startIcon={<UploadFileOutlinedIcon />}
                            onClick={() => galleryInputRefs.current[key]?.click()}
                          >
                            {chosenFile ? "Choose another" : "Choose from library"}
                          </Button>
                          <Button
                            variant="contained"
                            startIcon={<UploadFileOutlinedIcon />}
                            onClick={() => cameraInputRefs.current[key]?.click()}
                          >
                            {step.inputType === "video" ? "Use camera" : "Take photo"}
                          </Button>
                        </Stack>
                        {chosenFile && (
                          <Stack spacing={0.75}>
                            {previewUrl && (
                              <Box
                                component="img"
                                src={previewUrl}
                                sx={{ maxHeight: 160, maxWidth: "100%", borderRadius: 1, objectFit: "contain" }}
                              />
                            )}
                            {!previewUrl && chosenFile.type.startsWith("video/") && (
                              <Typography variant="caption" color="text.secondary">
                                Video selected: {chosenFile.name}
                              </Typography>
                            )}
                            <Typography variant="caption" color="text.secondary">
                              {chosenFile.name} - {formatBytes(chosenFile.size)}
                            </Typography>
                          </Stack>
                        )}
                      </Stack>
                    </Paper>
                  );
                })}

                <Button
                  variant="contained"
                  size="large"
                  fullWidth
                  disabled={!tokenInfo.missingSteps?.some((step) => selectedFiles[`${step.stepId}-${step.inputId}`])}
                  onClick={handleMissingMediaUpload}
                  startIcon={<UploadFileOutlinedIcon />}
                >
                  Upload missing media
                </Button>
              </>
            ) : (
              <>
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
                    {formatBytes(selectedFile.size)} - Tap to change
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
              </>
            )}
          </Stack>
        )}
      </Paper>
    </Box>
  );
}
