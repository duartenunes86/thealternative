import { useMemo } from 'react';
import { query, where, limit } from 'firebase/firestore';
import { conversationsCollection } from '@lib/firebase/collections';
import { useCollection } from './useCollection';
import type { Conversation } from '@lib/types/message';

type UseConversations = {
  conversations: Conversation[] | null;
  unreadTotal: number;
  loading: boolean;
};

/**
 * The signed-in user's conversations, newest first, unread ones on top.
 * Sorted here rather than in the query so Firestore needs no extra index.
 */
export function useConversations(userId: string | null): UseConversations {
  const { data, loading } = useCollection(
    query(
      conversationsCollection,
      where('participants', 'array-contains', userId ?? '-'),
      limit(200)
    ),
    { allowNull: true, disabled: !userId, preserve: true }
  );

  return useMemo(() => {
    if (!data || !userId) return { conversations: data, unreadTotal: 0, loading };

    const time = (c: Conversation): number =>
      (c.updatedAt?.toMillis?.() as number | undefined) ?? Date.now();

    const sorted = [...data].sort((a, b) => {
        const unreadA = (a.unread?.[userId] ?? 0) > 0 ? 1 : 0;
        const unreadB = (b.unread?.[userId] ?? 0) > 0 ? 1 : 0;
        if (unreadA !== unreadB) return unreadB - unreadA;
        return time(b) - time(a);
      });

    const unreadTotal = sorted.reduce((sum, c) => sum + (c.unread?.[userId] ?? 0), 0);

    return { conversations: sorted, unreadTotal, loading };
  }, [data, loading, userId]);
}
