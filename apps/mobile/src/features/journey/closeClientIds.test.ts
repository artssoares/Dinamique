import { describe, expect, it } from 'vitest';
import { closeRowClientId } from './closeClientIds';

const JOURNEY = '4c6f2b7a-2f1e-4a3b-9c8d-0e1f2a3b4c5d';
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('closeRowClientId', () => {
  it('is a well-formed UUID', () => {
    expect(closeRowClientId(JOURNEY, 'revenue', 'uber')).toMatch(UUID_SHAPE);
  });

  it('gives the same id every time, which is the whole point', () => {
    // A retry after a remount has no memory of the first attempt. The id has
    // to come out the same or the close cannot replace what it wrote before.
    expect(closeRowClientId(JOURNEY, 'revenue', 'uber')).toBe(
      closeRowClientId(JOURNEY, 'revenue', 'uber'),
    );
  });

  it('separates the platforms within one journey', () => {
    expect(closeRowClientId(JOURNEY, 'revenue', 'uber')).not.toBe(
      closeRowClientId(JOURNEY, 'revenue', '99'),
    );
  });

  it('separates revenues from expenses with the same subject', () => {
    expect(closeRowClientId(JOURNEY, 'revenue', 'x')).not.toBe(
      closeRowClientId(JOURNEY, 'expense', 'x'),
    );
  });

  it('separates one journey from another', () => {
    expect(closeRowClientId(JOURNEY, 'revenue', 'uber')).not.toBe(
      closeRowClientId('11111111-2222-3333-4444-555555555555', 'revenue', 'uber'),
    );
  });

  it('does not collide across a realistic day', () => {
    const ids = new Set<string>();
    for (let journey = 0; journey < 50; journey += 1) {
      for (const kind of ['revenue', 'expense'] as const) {
        for (let subject = 0; subject < 20; subject += 1) {
          ids.add(closeRowClientId(`journey-${journey}`, kind, `subject-${subject}`));
        }
      }
    }
    expect(ids.size).toBe(50 * 2 * 20);
  });
});
