/**
 * @jest-environment node
 */
import { resolveUserEmail } from '@lib/server/user-email';

describe('resolveUserEmail', () => {
  it('uses the account email when set', () => {
    expect(resolveUserEmail({ email: 'a@x.com', providerData: [] })).toBe('a@x.com');
  });

  it('falls back to a provider email when the account email is empty', () => {
    const record = {
      email: undefined,
      providerData: [{ email: '' }, { email: 'g@gmail.com' }]
    } as never;
    expect(resolveUserEmail(record)).toBe('g@gmail.com');
  });

  it('falls back to the Firestore email field last', () => {
    expect(resolveUserEmail({ email: undefined, providerData: [] } as never, 'f@x.com')).toBe(
      'f@x.com'
    );
  });

  it('returns undefined when there is no address anywhere', () => {
    expect(resolveUserEmail({ email: undefined, providerData: [] } as never, 'nope')).toBeUndefined();
    expect(resolveUserEmail(null)).toBeUndefined();
  });
});
