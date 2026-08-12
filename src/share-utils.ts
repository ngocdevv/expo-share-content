import type { SharePayload } from './ExpoShareContent.types';

/**
 * Removes duplicate native deliveries while preserving arrival order.
 * The same payload can be observed through both the cold-start queue and a live event.
 */
export function dedupeShares(shares: readonly SharePayload[]): SharePayload[] {
  const seen = new Set<string>();

  return shares.filter((share) => {
    if (seen.has(share.id)) {
      return false;
    }
    seen.add(share.id);
    return true;
  });
}
