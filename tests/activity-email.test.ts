/**
 * @jest-environment node
 */
import { buildActivityEmail } from '@lib/server/activity';
import { unsubscribeToken, tokenIsValid } from '@lib/server/mail';
import type { ActivityItem } from '@lib/server/activity';

const unsub = 'https://thealternative.social/api/digest/unsubscribe?uid=u1&token=t&kind=activity';

test('nothing to send gives no email', () => {
  expect(buildActivityEmail([], unsub)).toBeNull();
});

test('one follower: simple subject and profile link', () => {
  const email = buildActivityEmail([{ kind: 'follow', fromName: 'Ana', fromUsername: 'ana' }], unsub);
  expect(email?.subject).toBe('Ana followed you');
  expect(email?.html).toContain('/user/ana');
  expect(email?.html).toContain('Turn off activity emails');
});

test('groups followers and likes per post, messages first', () => {
  const items: ActivityItem[] = [
    { kind: 'follow', fromName: 'Ana', fromUsername: 'ana' },
    { kind: 'follow', fromName: 'Ben', fromUsername: 'ben' },
    { kind: 'follow', fromName: 'Cy', fromUsername: 'cy' },
    { kind: 'like', fromName: 'Ana', fromUsername: 'ana', tweetId: 't1', tweetText: 'My first post' },
    { kind: 'like', fromName: 'Ben', fromUsername: 'ben', tweetId: 't1', tweetText: 'My first post' },
    { kind: 'reply', fromName: 'Dee', fromUsername: 'dee', replyId: 'r1', replyText: 'Great point' },
    { kind: 'message', fromName: 'Eve', fromUsername: 'eve', conversationId: 'eve__me', count: 2, preview: 'are you there?' }
  ];
  const email = buildActivityEmail(items, unsub);
  expect(email?.lines).toEqual([
    '2 new messages from Eve (@eve)',
    'Dee (@dee) replied to your post',
    'Ana, Ben and 1 other followed you',
    'Ana and Ben liked your post'
  ]);
  expect(email?.subject).toBe('2 new messages from Eve (@eve) + 3 more updates');
  expect(email?.html).toContain('/messages/eve__me');
});

test('user text is escaped', () => {
  const email = buildActivityEmail(
    [{ kind: 'reply', fromName: '<b>x</b>', fromUsername: 'x', replyId: 'r', replyText: '<script>alert(1)</script>' }],
    unsub
  );
  expect(email?.html).not.toContain('<script>');
  expect(email?.html).toContain('&lt;script&gt;');
});

test('unsubscribe tokens are per kind, and old digest links keep working', () => {
  process.env.DIGEST_SECRET = 'test-secret';
  const digest = unsubscribeToken('u1', 'digest');
  const activity = unsubscribeToken('u1', 'activity');
  expect(digest).not.toBe(activity);
  expect(tokenIsValid('u1', 'digest', digest)).toBe(true);
  expect(tokenIsValid('u1', 'activity', digest)).toBe(false);
  expect(tokenIsValid('u2', 'activity', activity)).toBe(false);
});
