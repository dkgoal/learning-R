// R-01: rather than publish licensed C8 ratings (JD Power / CR / Edmunds) with
// no agreement, we compute and publish our OWN reliability index from free,
// public NHTSA data (complaint density + open recalls). This is documented on
// the methodology page and is fully publishable.
//
// Index is 0..100, higher = better. It is a transparent, reproducible function
// of two public inputs — not a proprietary black box.

export interface ReliabilityInputs {
  openRecallCount: number;
  complaintCount: number;
}

// Penalty weights (kept here, not inline — §9).
const RECALL_PENALTY = 6; // points per open recall
const COMPLAINT_PENALTY = 0.4; // points per NHTSA complaint
const BASELINE = 100;
const FLOOR = 5;

export function computeReliabilityIndex(inputs: ReliabilityInputs): number {
  const penalty =
    inputs.openRecallCount * RECALL_PENALTY +
    inputs.complaintCount * COMPLAINT_PENALTY;
  return Math.max(FLOOR, Math.round(BASELINE - penalty));
}
