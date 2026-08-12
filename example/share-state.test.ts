/// <reference types="jest" />

import { removeSharesById } from './share-state';

describe('removeSharesById', () => {
  it('preserves shares that arrive after the clear snapshot is captured', () => {
    const listed = [{ id: 'first' }, { id: 'second' }];
    const incoming = { id: 'incoming-during-clear' };
    const current = [...listed, incoming];

    expect(removeSharesById(current, listed.map((share) => share.id))).toEqual([incoming]);
  });
});
