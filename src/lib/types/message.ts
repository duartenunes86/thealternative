import type { Timestamp, FirestoreDataConverter } from 'firebase/firestore';

/**
 * A one-to-one conversation. The id is both user ids sorted and joined with
 * "__", so two people always share exactly one conversation.
 */
export type Conversation = {
  id: string;
  participants: string[];
  lastMessage: {
    text: string;
    from: string;
    createdAt: Timestamp;
  } | null;
  /** unread message count per participant */
  unread: Record<string, number>;
  /** participants who blocked this conversation; nobody can send while non-empty */
  blockedBy: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type Message = {
  id: string;
  from: string;
  text: string;
  createdAt: Timestamp;
};

export const MAX_MESSAGE_LENGTH = 2000;

export function conversationIdFor(a: string, b: string): string {
  return [a, b].sort().join('__');
}

export function otherParticipant(conversation: Pick<Conversation, 'participants'>, me: string): string {
  return conversation.participants.find((id) => id !== me) ?? me;
}

export const conversationConverter: FirestoreDataConverter<Conversation> = {
  toFirestore(conversation) {
    return { ...conversation };
  },
  fromFirestore(snapshot, options) {
    const { id } = snapshot;
    const data = snapshot.data(options);
    return { id, ...data } as Conversation;
  }
};

export const messageConverter: FirestoreDataConverter<Message> = {
  toFirestore(message) {
    return { ...message };
  },
  fromFirestore(snapshot, options) {
    const { id } = snapshot;
    const data = snapshot.data(options);
    return { id, ...data } as Message;
  }
};
