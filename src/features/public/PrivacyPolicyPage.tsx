import { Link, Paper, Stack, Typography } from "@mui/material";
import { APP_NAME } from "../../constants/branding";
import PublicPageLayout, { PublicSection } from "./PublicPageLayout";
import { PRIVACY_LAST_UPDATED, PUBLIC_SITE_ORIGIN, SUPPORT_EMAIL, SUPPORT_URL } from "./publicSite";

/*
 * Every statement below is traceable to code/config in this repository (see the PR
 * description for the evidence map). Practices that could NOT be proven from the
 * repo are deliberately left out of this page and listed in the PR as
 * "owner confirmation required" — do not add claims here without confirming them.
 * Keep the data categories in sync with ios/App/App/PrivacyInfo.xcprivacy and the
 * App Store privacy declarations.
 */

interface DataCategory {
  name: string;
  what: string;
  how: string;
}

// The seven categories declared in the App Store privacy details / PrivacyInfo.xcprivacy.
const DATA_CATEGORIES: DataCategory[] = [
  {
    name: "Name",
    what: "Your account name, and the names of people recorded in a project, such as customer contacts and signers.",
    how: "Entered by you or your administrator when an account is set up, entered by users into projects, or typed by a signer.",
  },
  {
    name: "Email Address",
    what: "Your account email address, and email addresses of project contacts and signature recipients.",
    how: "Entered by you or your administrator when an account is set up, or entered by users into projects and signature requests.",
  },
  {
    name: "Phone Number",
    what: "Phone numbers of project contacts and site contacts.",
    how: "Entered by users into project and site records. A phone number is not needed to create an account.",
  },
  {
    name: "Physical Address",
    what: "Site addresses and project contact addresses.",
    how: "Entered by users into project and site records.",
  },
  {
    name: "Photos or Videos",
    what: "Photos and video taken as inspection and workflow evidence.",
    how: "Captured with your device camera and microphone, or chosen from your photo library, when you attach them to a workflow run. They are uploaded to our servers when your device is online.",
  },
  {
    name: "Other User Content",
    what: "Workflow answers and measurements, inspection results, notes, issues, uploaded documents, electronic signatures (the signature image, signer name, role and time) and problem reports you send us.",
    how: "Entered, uploaded or captured by you and your colleagues while using the app.",
  },
  {
    name: "Device ID",
    what: "A push notification token that identifies your device to the notification service, and device or browser details (user agent) recorded at sign-in and when a signature is captured.",
    how: "Collected automatically. The push token is registered only if you allow notifications on the mobile app.",
  },
];

interface Provider {
  name: string;
  role: string;
}

const PROVIDERS: Provider[] = [
  {
    name: "Amazon Web Services",
    role: "Hosts the application servers, the database and the file storage that holds photos, videos and documents.",
  },
  {
    name: "Cloudflare and Amazon CloudFront",
    role: "Deliver this website and the web version of the app. Cloudflare also routes email sent to our support address.",
  },
  {
    name: "Resend",
    role: "Sends service emails for us, such as account invitations, password reset links, one-time codes for signing links, notifications and reports. It receives the recipient email address and the email content.",
  },
  {
    name: "Apple Push Notification service and Google Firebase Cloud Messaging",
    role: "Deliver push notifications to your device when notifications are enabled. They receive your device push token and the notification content.",
  },
  {
    name: "OpenStreetMap",
    role: "Supplies map images for map views. When a map is shown, your device requests map tiles from OpenStreetMap servers, which can see your IP address and the map area requested.",
  },
  {
    name: "Google Fonts",
    role: "Supplies the typefaces used by the app. Your device requests font files from Google, which can see your IP address.",
  },
];

function Bullets({ items }: { items: string[] }) {
  return (
    <Stack component="ul" spacing={1} sx={{ m: 0, pl: 3 }}>
      {items.map((item) => (
        <Typography key={item} component="li">
          {item}
        </Typography>
      ))}
    </Stack>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <PublicPageLayout title="Privacy Policy">
      <Typography variant="h3" component="h1" fontWeight={800} sx={{ fontSize: { xs: "2rem", sm: "2.6rem" } }}>
        Privacy Policy
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        Last updated: {PRIVACY_LAST_UPDATED}
      </Typography>
      <Typography sx={{ mt: 2 }}>
        This policy explains how {APP_NAME} (“we”, “us”) collects, uses and shares personal information when you use the{" "}
        {APP_NAME} mobile apps and the web app at {PUBLIC_SITE_ORIGIN.replace("https://", "")}. {APP_NAME} is a field
        operations platform for managing projects, assets, workflows, inspections, evidence and operational issues.
      </Typography>

      <PublicSection id="accounts" heading="Accounts and your organisation">
        <Typography>
          {APP_NAME} accounts are created and managed by your organisation&apos;s administrators. Your organisation
          decides what project, asset and workflow information is entered and who can see it, so its own policies and
          instructions may also apply to your data.
        </Typography>
      </PublicSection>

      <PublicSection id="collect" heading="Information we collect and how">
        <Stack spacing={1.5}>
          {DATA_CATEGORIES.map((c) => (
            <Paper key={c.name} variant="outlined" sx={{ p: 2.25, borderRadius: 2 }}>
              <Typography variant="subtitle1" component="h3" fontWeight={700}>
                {c.name}
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                <strong>What:</strong> {c.what}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                <strong>How:</strong> {c.how}
              </Typography>
            </Paper>
          ))}
        </Stack>
        <Typography variant="h6" component="h3" fontWeight={700} sx={{ pt: 1 }}>
          Account security and diagnostic information
        </Typography>
        <Bullets
          items={[
            "Sign-in and activity records: when you sign in we record your email address, IP address and device or browser details, and we keep an activity log of account actions.",
            "Passwords are stored only as a one-way hash, never in readable form. If you turn on two-factor authentication, we store the secret and recovery codes needed to run it.",
            "Problem reports: if you choose “Report a problem”, or the app reports an error, we receive the details you provide together with your account email, role, app version, platform, device or browser details, the screen you were on, error details, recent in-app actions and whether you were offline.",
          ]}
        />
        <Typography variant="h6" component="h3" fontWeight={700} sx={{ pt: 1 }}>
          What we do not collect or do
        </Typography>
        <Bullets
          items={[
            "The app does not access your location.",
            "Face ID and Touch ID checks are performed by your device. We do not receive your biometric data. If you set an app PIN, only a hash of it is kept in your device's secure storage and it is not sent to our servers.",
            "We do not use your information for advertising or to track you across other companies' apps and websites, and the app contains no advertising or analytics SDKs.",
          ]}
        />
        <Typography variant="body2" color="text.secondary">
          The mobile apps ask your permission before using the camera, microphone, photo library, notifications and
          Face ID.
        </Typography>
      </PublicSection>

      <PublicSection id="use" heading="Why we use your information">
        <Bullets
          items={[
            "To provide the app: your account, projects, assets, workflows, inspections, evidence, issues, reports and electronic signatures.",
            "To keep accounts secure, including sign-in sessions and account activity records.",
            "To send service emails and push notifications, such as invitations, password resets, signing requests and alerts.",
            "To investigate and fix problems reported by users and to provide support.",
          ]}
        />
        <Typography>All of the information above is used for app functionality.</Typography>
      </PublicSection>

      <PublicSection id="sharing" heading="Who receives or processes your information">
        <Typography>
          Information you enter is visible to other users in your organisation according to the permissions your
          organisation assigns. If a user sends a signing link or a shared report link, the recipient can see what that
          link is for. Signing, report and upload links expire after a limited time.
        </Typography>
        <Typography>We use these service providers to run the app:</Typography>
        <Stack spacing={1.5}>
          {PROVIDERS.map((p) => (
            <Paper key={p.name} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Typography variant="subtitle2" component="h3" fontWeight={700}>
                {p.name}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {p.role}
              </Typography>
            </Paper>
          ))}
        </Stack>
      </PublicSection>

      <PublicSection id="security" heading="How we protect and store information">
        <Bullets
          items={[
            "Data sent between the app and our servers uses HTTPS.",
            "Access to project data is controlled by roles and permissions assigned by your organisation.",
            "On mobile devices, your sign-in session is kept in the device's secure storage (Keychain on iPhone and iPad, Keystore on Android).",
            "So that field work can continue without a connection, the app keeps a copy of the data you need, and work waiting to upload, in storage on your device until it synchronizes.",
          ]}
        />
      </PublicSection>

      <PublicSection id="retention" heading="How long we keep information and how to delete it">
        <Bullets
          items={[
            "We keep information while your account and your organisation's projects are in use, until it is removed as described below.",
            "Administrators can remove user accounts, project contacts, assets and problem reports. Removing a user account deletes the account record.",
            "Sign-in and account activity records (which include the account's email address, IP address and device details) are stored separately and are not automatically removed when an account is deleted.",
            "We do not publish fixed retention periods.",
          ]}
        />
      </PublicSection>

      <PublicSection id="choices" heading="Your choices and requests">
        <Bullets
          items={[
            "To access, correct or delete your personal information, or to withdraw your consent to its use, contact your organisation's administrator, who manages accounts and project data, or contact us at the address below. If you contact us, we will work with your organisation's administrator to action the request.",
            "You can turn off camera, microphone, photo library, notification and Face ID access at any time in your device Settings. Features that need that access, such as attaching photos, will stop working. Uninstalling the app does not delete data already stored on our servers.",
          ]}
        />
      </PublicSection>

      <PublicSection id="children" heading="Children">
        <Typography>{APP_NAME} is a workplace application and is not directed at children.</Typography>
      </PublicSection>

      <PublicSection id="changes" heading="Changes to this policy">
        <Typography>
          We may update this policy. The current version is always available at this page, and the “Last updated” date
          shows when it last changed.
        </Typography>
      </PublicSection>

      <PublicSection id="contact" heading="Contact us">
        <Typography>
          Questions about this policy or requests about your information: email{" "}
          <Link href={`mailto:${SUPPORT_EMAIL}`} underline="hover" fontWeight={700}>
            {SUPPORT_EMAIL}
          </Link>
          . For help using the app, see our <Link href={SUPPORT_URL} underline="hover">Support page</Link>.
        </Typography>
      </PublicSection>
    </PublicPageLayout>
  );
}
