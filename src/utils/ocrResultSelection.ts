/**
 * Chooses ONE OCR candidate from a small set of passes (ocrFieldPipeline.planOcrPasses),
 * deterministically. Scoring only ever RANKS engine outputs — the chosen string is returned
 * exactly as the engine produced it (whitespace-normalized), never edited: no O→0, no dropped
 * punctuation, no "fixing". The technician corrects in the editable review field.
 *
 * Longer is NOT better: a long noisy read (neighbour text, fragments, punctuation debris) must
 * not beat a shorter clean one. Scores start from Tesseract's own confidence and are penalized
 * for signs of debris; agreement between independent passes is rewarded.
 */

import { normalizeOcrCandidate } from "./ocrPreprocess";

export interface OcrPassResult {
  passId: string;
  /** Raw engine text. */
  text: string;
  /** Engine confidence 0–100. */
  confidence: number;
}

export interface ScoredOcrCandidate {
  passId: string;
  /** Whitespace-normalized engine text — the candidate shown to the technician. */
  text: string;
  confidence: number;
  score: number;
  reasons: string[];
}

/** Punctuation that is legitimately part of field values (J000376, S4912/89, 19.0006X, V1.2.3,
 *  ABC-123, SN_01, 12:30, #4, (A)…). Anything else is treated as likely debris for RANKING only. */
const MEANINGFUL_PUNCTUATION = new Set([".", "/", "-", "_", ":", "#", "+", "(", ")", ",", "&"]);
const ALNUM = /[\p{L}\p{N}]/u;

const MULTI_LINE_PENALTY = 25;
const STRAY_CHAR_PENALTY = 8;
const STRAY_CHAR_PENALTY_CAP = 40;
const EDGE_DEBRIS_PENALTY = 15;
const AGREEMENT_BONUS = 8;

/** Score above which the first pass is trusted without running the rest of the plan. */
export const CONFIDENT_SCORE = 85;
/** Below this the review screen suggests checking the value carefully. */
export const LOW_CONFIDENCE_SCORE = 60;

export function scoreOcrCandidate(result: OcrPassResult): ScoredOcrCandidate {
  const text = normalizeOcrCandidate(result.text);
  const confidence = Math.max(0, Math.min(100, Number.isFinite(result.confidence) ? result.confidence : 0));
  const reasons: string[] = [];
  if (!text || !ALNUM.test(text)) {
    return { passId: result.passId, text, confidence, score: Number.NEGATIVE_INFINITY, reasons: ["no-alphanumeric"] };
  }
  let score = confidence;

  const lines = result.text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length > 1) {
    score -= MULTI_LINE_PENALTY;
    reasons.push("multi-line");
  }

  let stray = 0;
  for (const ch of text) {
    if (ch === " " || ALNUM.test(ch) || MEANINGFUL_PUNCTUATION.has(ch)) continue;
    stray += 1;
  }
  if (stray) {
    score -= Math.min(STRAY_CHAR_PENALTY_CAP, stray * STRAY_CHAR_PENALTY);
    reasons.push(`stray-punctuation×${stray}`);
  }

  // Punctuation-only tokens at the ends (the `;` in `3247751 ;`) are typical band-edge debris.
  const tokens = text.split(" ");
  if (tokens.length > 1) {
    for (const edge of [tokens[0], tokens[tokens.length - 1]]) {
      if (!ALNUM.test(edge)) {
        score -= EDGE_DEBRIS_PENALTY;
        reasons.push("edge-debris");
      }
    }
  }

  return { passId: result.passId, text, confidence, score, reasons };
}

export function isConfidentEnough(candidate: ScoredOcrCandidate): boolean {
  return candidate.score >= CONFIDENT_SCORE && candidate.reasons.length === 0;
}

/**
 * Picks the best candidate. Ties break on engine confidence, then plan order — never on length.
 * Returns null when no pass produced anything alphanumeric.
 */
export function selectOcrCandidate(results: OcrPassResult[]): ScoredOcrCandidate | null {
  const scored = results.map(scoreOcrCandidate).filter((c) => Number.isFinite(c.score));
  if (!scored.length) return null;
  const withAgreement = scored.map((c) => {
    const agreeing = scored.filter((o) => o !== c && o.text === c.text).length;
    return agreeing
      ? { ...c, score: c.score + agreeing * AGREEMENT_BONUS, reasons: [...c.reasons, `agrees×${agreeing}`] }
      : c;
  });
  let best = withAgreement[0];
  for (const c of withAgreement.slice(1)) {
    if (c.score > best.score || (c.score === best.score && c.confidence > best.confidence)) best = c;
  }
  return best;
}
