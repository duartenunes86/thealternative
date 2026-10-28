/**
 * @jest-environment node
 */
// Security rules tests. Run with the Firestore emulator:
//   npx firebase emulators:exec --only firestore --project demo-thealternative "npx jest tests/firestore-rules.test.ts"
import { readFileSync } from 'fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} from '@firebase/rules-unit-testing';
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  writeBatch,
  arrayUnion,
  arrayRemove,
  increment,
  serverTimestamp
} from 'firebase/firestore';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';

let env: RulesTestEnvironment;
const A = 'alice';
const B = 'bob';
const C = 'carol';
const AB = 'alice__bob';

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-thealternative',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') }
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const id of [A, B, C])
      await setDoc(doc(db, 'users', id), { name: id, username: id, followers: [], following: [] });
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();

async function makeConversation(blockedBy: string[] = []): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'conversations', AB), {
      participants: [A, B],
      lastMessage: null,
      unread: { [A]: 0, [B]: 0 },
      blockedBy,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  });
}

describe('following', () => {
  test('can add only yourself to someone else’s followers', async () => {
    const db = as(A);
    await assertSucceeds(updateDoc(doc(db, 'users', B), { followers: arrayUnion(A), updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, 'users', B), { followers: arrayUnion(C) }));
    await assertFails(updateDoc(doc(db, 'users', B), { name: 'hacked' }));
  });

  test('can remove only yourself from someone else’s followers', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'users', B), { followers: [A, C] });
    });
    await assertSucceeds(updateDoc(doc(as(A), 'users', B), { followers: arrayRemove(A) }));
    await assertFails(updateDoc(doc(as(A), 'users', B), { followers: arrayRemove(C) }));
  });

  test('owner can still edit their own profile and email settings', async () => {
    await assertSucceeds(updateDoc(doc(as(A), 'users', A), { emailActivity: 'off', emailDigest: 'weekly' }));
  });
});

describe('conversations', () => {
  const newConversation = (participants: string[], blockedBy: string[] = []) => ({
    participants,
    lastMessage: null,
    unread: Object.fromEntries(participants.map((p) => [p, 0])),
    blockedBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  test('a participant can check and create their conversation', async () => {
    const db = as(A);
    await assertSucceeds(getDoc(doc(db, 'conversations', AB)));
    await assertSucceeds(setDoc(doc(db, 'conversations', AB), newConversation([A, B])));
  });

  test('nobody else can create or read it', async () => {
    await assertFails(getDoc(doc(as(C), 'conversations', AB)));
    await assertFails(setDoc(doc(as(C), 'conversations', AB), newConversation([A, B])));
    await makeConversation();
    await assertFails(getDoc(doc(as(C), 'conversations', AB)));
    await assertFails(getDocs(collection(as(C), 'conversations', AB, 'messages')));
  });

  test('the id must match the participants', async () => {
    await assertFails(setDoc(doc(as(A), 'conversations', 'alice__carol'), newConversation([A, B])));
    await assertFails(setDoc(doc(as(A), 'conversations', 'bob__alice'), newConversation([B, A])));
    await assertFails(setDoc(doc(as(A), 'conversations', AB), newConversation([A, B], [B])));
  });

  test('inbox query only returns your conversations', async () => {
    await makeConversation();
    await assertSucceeds(getDocs(query(collection(as(A), 'conversations'), where('participants', 'array-contains', A))));
    await assertFails(getDocs(collection(as(A), 'conversations')));
  });

  test('sending a message works like the app does it', async () => {
    await makeConversation();
    const db = as(A);
    const batch = writeBatch(db);
    batch.set(doc(collection(db, 'conversations', AB, 'messages')), { from: A, text: 'hi bob', createdAt: serverTimestamp() });
    batch.update(doc(db, 'conversations', AB), {
      lastMessage: { text: 'hi bob', from: A, createdAt: serverTimestamp() },
      [`unread.${B}`]: increment(1),
      updatedAt: serverTimestamp()
    });
    await assertSucceeds(batch.commit());
    await assertSucceeds(getDocs(collection(as(B), 'conversations', AB, 'messages')));
    await assertSucceeds(updateDoc(doc(as(B), 'conversations', AB), { [`unread.${B}`]: 0 }));
  });

  test('cannot send as someone else, empty, or too long', async () => {
    await makeConversation();
    const msgs = collection(as(A), 'conversations', AB, 'messages');
    await assertFails(setDoc(doc(msgs), { from: B, text: 'pretending', createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(msgs), { from: A, text: '', createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(msgs), { from: A, text: 'x'.repeat(2001), createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(msgs), { from: A, text: 'ok', createdAt: serverTimestamp(), extra: true }));
  });

  test('blocking stops messages both ways and only the blocker can unblock', async () => {
    await makeConversation();
    await assertSucceeds(updateDoc(doc(as(B), 'conversations', AB), { blockedBy: arrayUnion(B) }));
    await assertFails(setDoc(doc(collection(as(A), 'conversations', AB, 'messages')), { from: A, text: 'hello?', createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(collection(as(B), 'conversations', AB, 'messages')), { from: B, text: 'hi', createdAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as(A), 'conversations', AB), { blockedBy: arrayRemove(B) }));
    await assertSucceeds(updateDoc(doc(as(B), 'conversations', AB), { blockedBy: arrayRemove(B) }));
  });

  test('participants can’t be changed', async () => {
    await makeConversation();
    await assertFails(updateDoc(doc(as(A), 'conversations', AB), { participants: [A, C] }));
  });

  test('you can delete only your own messages', async () => {
    await makeConversation();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'conversations', AB, 'messages', 'm1'), { from: B, text: 'from bob', createdAt: new Date() });
      await setDoc(doc(db, 'conversations', AB, 'messages', 'm2'), { from: A, text: 'from alice', createdAt: new Date() });
    });
    await assertFails(deleteDoc(doc(as(A), 'conversations', AB, 'messages', 'm1')));
    await assertSucceeds(deleteDoc(doc(as(A), 'conversations', AB, 'messages', 'm2')));
  });
});
