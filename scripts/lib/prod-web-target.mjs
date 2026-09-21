/**
 * The verified production web target. Identified from evidence, NOT from older docs (which still
 * describe www as sharing the staging distribution E1YN5XTWDWRHYP — that distribution now serves
 * staging.strata-ngo.com only):
 *   - strata-ngo-web-prod/index.html carried the same S3 VersionId that https://www.strata-ngo.com/
 *     was serving (x-amz-version-id), and
 *   - the bucket policy admits exactly one CloudFront distribution (E1AYVTSTERUCZP), whose aliases
 *     are www.strata-ngo.com and strata-ngo.com and whose origin is this bucket.
 * Deploy/cleanup tooling verifies these facts against AWS before acting (see verifyTarget).
 */
export const PROD_WEB = {
  bucket: "strata-ngo-web-prod",
  distributionId: "E1AYVTSTERUCZP",
  aliases: ["www.strata-ngo.com", "strata-ngo.com"],
  siteUrl: "https://www.strata-ngo.com",
  region: "ap-southeast-2",
  profile: process.env.AWS_PROFILE || "strata-agent",
  /** index.html and the manifest must never be cached; hashed assets are content-addressed. */
  noCacheControl: "no-cache,no-store,must-revalidate",
};

/** Pure check used by tooling: does what AWS reports match the pinned target? */
export function verifyTarget({ distribution, bucketPolicy }) {
  const problems = [];
  const aliases = distribution?.Aliases?.Items ?? [];
  for (const a of PROD_WEB.aliases) if (!aliases.includes(a)) problems.push(`distribution ${PROD_WEB.distributionId} is missing alias ${a}`);
  const origins = (distribution?.Origins?.Items ?? []).map((o) => o.DomainName);
  if (!origins.some((d) => d.startsWith(`${PROD_WEB.bucket}.s3.`))) problems.push(`distribution origin is not ${PROD_WEB.bucket} (${origins.join(", ")})`);
  const policy = typeof bucketPolicy === "string" ? bucketPolicy : JSON.stringify(bucketPolicy ?? {});
  if (!policy.includes(`distribution/${PROD_WEB.distributionId}`)) problems.push(`bucket policy does not admit distribution ${PROD_WEB.distributionId}`);
  return { ok: problems.length === 0, problems };
}
