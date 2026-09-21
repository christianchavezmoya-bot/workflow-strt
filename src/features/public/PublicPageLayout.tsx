import { useEffect, type ReactNode } from "react";
import { Box, Container, Divider, Link, Stack, Typography } from "@mui/material";
import strataLogo from "../../assets/strata_transparent.png";
import { APP_NAME } from "../../constants/branding";
import { PRIVACY_URL, SUPPORT_URL } from "./publicSite";

interface PublicPageLayoutProps {
  /** Document title suffix, e.g. "Support". */
  title: string;
  children: ReactNode;
}

/**
 * Chrome for pages served without a session (/support, /privacy). Deliberately
 * self-contained: no auth, permissions, API or AppShell dependencies.
 */
export default function PublicPageLayout({ title, children }: PublicPageLayoutProps) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · ${APP_NAME}`;
    return () => {
      document.title = previous;
    };
  }, [title]);

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", color: "text.primary" }}>
      <Box component="header" sx={{ borderBottom: 1, borderColor: "divider", py: 2 }}>
        <Container maxWidth="md">
          <Box component="img" src={strataLogo} alt={APP_NAME} sx={{ height: 44, width: "auto", display: "block" }} />
        </Container>
      </Box>

      <Container component="main" maxWidth="md" sx={{ py: { xs: 3, sm: 5 } }}>
        {children}
      </Container>

      <Box component="footer" sx={{ pb: 5 }}>
        <Container maxWidth="md">
          <Divider sx={{ mb: 2 }} />
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={{ xs: 1, sm: 3 }}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", sm: "center" }}
          >
            <Typography variant="body2" color="text.secondary">
              © {new Date().getFullYear()} {APP_NAME}
            </Typography>
            <Stack direction="row" spacing={3}>
              <Link href={SUPPORT_URL} underline="hover" variant="body2">Support</Link>
              <Link href={PRIVACY_URL} underline="hover" variant="body2">Privacy Policy</Link>
            </Stack>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
}

/** Section heading + body used by both pages so they stay visually consistent. */
export function PublicSection({ id, heading, children }: { id?: string; heading: string; children: ReactNode }) {
  return (
    <Box component="section" id={id} aria-labelledby={id ? `${id}-heading` : undefined} sx={{ mt: 4 }}>
      <Typography id={id ? `${id}-heading` : undefined} variant="h5" component="h2" fontWeight={700} gutterBottom>
        {heading}
      </Typography>
      <Stack spacing={1.5}>{children}</Stack>
    </Box>
  );
}
