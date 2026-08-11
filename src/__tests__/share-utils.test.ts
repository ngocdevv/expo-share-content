import type { SharePayload } from '../ExpoShareContent.types';
import { dedupeShares } from '../share-utils';

const payload = (id: string, timestamp: number): SharePayload => ({
  id,
  timestamp,
  source: 'share-sheet',
  items: [
    {
      id: `${id}-item`,
      type: 'text',
      mimeType: 'text/plain',
      text: id,
    },
  ],
});

describe('dedupeShares', () => {
  it('keeps the first payload for each id and preserves arrival order', () => {
    const first = payload('first', 1);
    const duplicate = payload('first', 2);
    const second = payload('second', 3);

    expect(dedupeShares([first, duplicate, second])).toEqual([first, second]);
  });
});
