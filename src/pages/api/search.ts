import { adminDb, isAdminConfigured } from '@lib/firebase/admin';
import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Firestore has no full-text search, so at this size the whole user list and
 * a window of recent posts are scanned in memory. That is fine for hundreds
 * of documents; past a few thousand posts this wants a real search index
 * (Algolia, Typesense) rather than a bigger scan.
 */
const MAX_POSTS_SCANNED = 1000;
const MAX_RESULTS = 25;

export type SearchPerson = {
  id: string;
  name: string;
  username: string;
  photoURL: string | null;
  bio: string | null;
  verified: boolean;
};

export type SearchPost = {
  id: string;
  text: string;
  authorName: string;
  authorUsername: string;
  authorPhotoURL: string | null;
};

export type SearchResults = {
  people: SearchPerson[];
  posts: SearchPost[];
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SearchResults | { error: string }>
): Promise<void> {
  const q = (typeof req.query.q === 'string' ? req.query.q : '').trim();

  if (!q) {
    res.status(200).json({ people: [], posts: [] });
    return;
  }

  if (!isAdminConfigured()) {
    res.status(503).json({ error: 'Search is unavailable' });
    return;
  }

  const needle = q.toLowerCase();
  const db = adminDb();

  try {
    const usersSnapshot = await db.collection('users').get();

    type UserRow = {
      name?: string;
      username?: string;
      photoURL?: string | null;
      bio?: string | null;
      verified?: boolean;
    };

    const usersById = new Map<string, UserRow>();
    usersSnapshot.docs.forEach((doc) =>
      usersById.set(doc.id, doc.data() as UserRow)
    );

    const people: SearchPerson[] = [];

    usersById.forEach((data, id) => {
      const name = data.name ?? '';
      const username = data.username ?? '';

      if (
        !username ||
        !(
          username.toLowerCase().includes(needle) ||
          name.toLowerCase().includes(needle)
        )
      )
        return;

      people.push({
        id,
        name: name || username,
        username,
        photoURL: data.photoURL ?? null,
        bio: data.bio ?? null,
        verified: Boolean(data.verified)
      });
    });

    // an exact username match is what people usually want first
    people.sort((a, b) => {
      const aExact = a.username.toLowerCase() === needle ? 0 : 1;
      const bExact = b.username.toLowerCase() === needle ? 0 : 1;
      return aExact - bExact || a.username.localeCompare(b.username);
    });

    const postsSnapshot = await db
      .collection('tweets')
      .orderBy('createdAt', 'desc')
      .limit(MAX_POSTS_SCANNED)
      .get();

    const posts: SearchPost[] = [];

    postsSnapshot.docs.forEach((doc) => {
      const { text, createdBy } = doc.data() as {
        text?: string | null;
        createdBy?: string;
      };

      if (!text || !text.toLowerCase().includes(needle)) return;

      const author = usersById.get(createdBy ?? '');

      posts.push({
        id: doc.id,
        text,
        authorName: author?.name ?? 'Someone',
        authorUsername: author?.username ?? 'unknown',
        authorPhotoURL: author?.photoURL ?? null
      });
    });

    res.setHeader(
      'Cache-Control',
      'public, s-maxage=60, stale-while-revalidate=300'
    );

    res.status(200).json({
      people: people.slice(0, MAX_RESULTS),
      posts: posts.slice(0, MAX_RESULTS)
    });
  } catch {
    res.status(500).json({ error: 'Search failed' });
  }
}
