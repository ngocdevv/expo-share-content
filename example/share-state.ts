type ShareWithId = {
  id: string;
};

export function removeSharesById<T extends ShareWithId>(
  shares: readonly T[],
  shareIds: readonly string[]
): T[] {
  const removedIds = new Set(shareIds);
  return shares.filter((share) => !removedIds.has(share.id));
}
