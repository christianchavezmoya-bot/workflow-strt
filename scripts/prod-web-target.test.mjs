import { describe, expect, it } from "vitest";
import { PROD_WEB, verifyTarget } from "./lib/prod-web-target.mjs";

const good = {
  distribution: {
    Aliases: { Items: ["www.strata-ngo.com", "strata-ngo.com"] },
    Origins: { Items: [{ DomainName: "strata-ngo-web-prod.s3.ap-southeast-2.amazonaws.com" }] },
  },
  bucketPolicy: JSON.stringify({ Statement: [{ Condition: { ArnLike: { "AWS:SourceArn": "arn:aws:cloudfront::920154935299:distribution/E1AYVTSTERUCZP" } } }] }),
};

describe("pinned production web target", () => {
  it("is the verified prod bucket/distribution — never the staging ones the older docs still name", () => {
    expect(PROD_WEB.bucket).toBe("strata-ngo-web-prod");
    expect(PROD_WEB.distributionId).toBe("E1AYVTSTERUCZP");
    expect(PROD_WEB.bucket).not.toMatch(/staging/);
    expect(PROD_WEB.distributionId).not.toBe("E1YN5XTWDWRHYP");
    expect(PROD_WEB.noCacheControl).toBe("no-cache,no-store,must-revalidate");
  });

  it("verifyTarget accepts a matching distribution + bucket policy", () => {
    expect(verifyTarget(good)).toEqual({ ok: true, problems: [] });
  });

  it("refuses when www is no longer an alias of the pinned distribution", () => {
    const r = verifyTarget({ ...good, distribution: { ...good.distribution, Aliases: { Items: ["staging.strata-ngo.com"] } } });
    expect(r.ok).toBe(false);
    expect(r.problems.join()).toMatch(/missing alias www\.strata-ngo\.com/);
  });

  it("refuses when the distribution's origin is a different bucket (e.g. staging)", () => {
    const r = verifyTarget({ ...good, distribution: { ...good.distribution, Origins: { Items: [{ DomainName: "strata-ngo-web-staging.s3.ap-southeast-2.amazonaws.com" }] } } });
    expect(r.ok).toBe(false);
    expect(r.problems.join()).toMatch(/origin is not strata-ngo-web-prod/);
  });

  it("refuses when the bucket policy does not admit the pinned distribution", () => {
    const r = verifyTarget({ ...good, bucketPolicy: JSON.stringify({ Statement: [{ Condition: { ArnLike: { "AWS:SourceArn": "arn:aws:cloudfront::1:distribution/E1YN5XTWDWRHYP" } } }] }) });
    expect(r.ok).toBe(false);
    expect(r.problems.join()).toMatch(/does not admit distribution E1AYVTSTERUCZP/);
  });
});
