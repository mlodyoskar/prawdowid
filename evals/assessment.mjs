import { createHash } from 'node:crypto';

export function assessment(claim, model) {
  const payload = {
    claim: claim.claim,
    quotes: (claim.evidenceUse ?? []).map((u) => ({ role: u.stance, quote: u.quote })),
    explanation: [claim.explanation, claim.limitations, ...(claim.unknowns ?? [])]
      .filter(Boolean)
      .join('\n'),
  };
  const key = createHash('sha256')
    .update(JSON.stringify([model, payload]))
    .digest('hex');
  return { key, payload };
}
