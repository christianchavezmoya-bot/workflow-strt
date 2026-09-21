import { Box, Link, Paper, Stack, Typography } from "@mui/material";
import { APP_NAME } from "../../constants/branding";
import PublicPageLayout, { PublicSection } from "./PublicPageLayout";
import { PRIVACY_URL, SUPPORT_EMAIL } from "./publicSite";

const HELP_TOPICS: { title: string; body: string }[] = [
  {
    title: "Signing in and account access",
    body:
      "Sign in with the email address your organisation registered for you. New users receive an email invitation to set a password. If you cannot sign in or cannot see a project you expect, your organisation administrator can check your account and permissions.",
  },
  {
    title: "Password reset",
    body:
      "Choose “Forgot password?” on the sign-in screen and follow the link sent to your email. If no email arrives, check your spam folder or ask your administrator to send a new invitation.",
  },
  {
    title: "Projects and assets",
    body:
      "You see the projects and assets your role allows. If something is missing, ask your administrator to review your access.",
  },
  {
    title: "Workflows and inspections",
    body:
      "Open an assigned asset to start or continue its workflow. A workflow run cannot be completed while it has unresolved blocking issues; resolve them from the Issues Board first.",
  },
  {
    title: "Photos and field evidence",
    body:
      "Photos and video are captured with your device camera or chosen from your photo library. If the app cannot open the camera, microphone or photos, allow access in your device Settings for the app.",
  },
  {
    title: "Offline operation and synchronization",
    body:
      "Open the Sync Center to see what is waiting to upload. Items sync automatically when your connection returns; if two people changed the same item, you will be asked to choose which version to keep.",
  },
  {
    title: "Issues and reporting",
    body:
      "Record and track problems on a job from the Issues Board. If the app itself misbehaves, choose “Report a problem” from the top bar menu to send us the details.",
  },
];

export default function SupportPage() {
  return (
    <PublicPageLayout title="Support">
      <Typography variant="h3" component="h1" fontWeight={800} sx={{ fontSize: { xs: "2rem", sm: "2.6rem" } }}>
        {APP_NAME} Support
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mt: 1.5, fontSize: "1.1rem" }}>
        {APP_NAME} is a field operations platform for managing projects, assets, workflows, inspections, evidence and
        operational issues.
      </Typography>

      <PublicSection id="getting-help" heading="Getting Help">
        <Typography>
          If you have trouble accessing or using the app, contact your organisation administrator or {APP_NAME} support.
          Your administrator can usually resolve account, permission and project access questions fastest.
        </Typography>
      </PublicSection>

      <PublicSection id="help-topics" heading="Common Help Topics">
        <Stack spacing={1.5}>
          {HELP_TOPICS.map((topic) => (
            <Paper key={topic.title} variant="outlined" sx={{ p: 2.25, borderRadius: 2 }}>
              <Typography variant="subtitle1" component="h3" fontWeight={700}>
                {topic.title}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {topic.body}
              </Typography>
            </Paper>
          ))}
        </Stack>
      </PublicSection>

      <PublicSection id="offline-use" heading="Offline Use">
        <Typography>
          Supported field workflows can continue while connectivity is unavailable. Your work is kept on your device and
          synchronizes automatically when connectivity returns.
        </Typography>
      </PublicSection>

      <PublicSection id="account-access" heading="Account Access">
        <Typography>
          {APP_NAME} accounts are provided by your organisation. What you can see and do depends on the permissions your
          organisation has assigned to you.
        </Typography>
      </PublicSection>

      <PublicSection id="privacy" heading="Privacy">
        <Typography>
          Read how {APP_NAME} handles personal information in our{" "}
          <Link href={PRIVACY_URL} underline="hover">Privacy Policy</Link>.
        </Typography>
      </PublicSection>

      <PublicSection id="contact-support" heading="Contact Support">
        <Typography>
          Email us and include the email address on your account, the device you are using and what you were trying to
          do. Please do not send passwords.
        </Typography>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography component="span" color="text.secondary">Email:</Typography>
            <Link href={`mailto:${SUPPORT_EMAIL}`} underline="hover" fontWeight={700}>
              {SUPPORT_EMAIL}
            </Link>
          </Stack>
        </Box>
      </PublicSection>
    </PublicPageLayout>
  );
}
