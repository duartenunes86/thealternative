import type { Theme, Accent } from './theme';
import type { Timestamp, FirestoreDataConverter } from 'firebase/firestore';

export type User = {
  id: string;
  bio: string | null;
  name: string;
  theme: Theme | null;
  accent: Accent | null;
  website: string | null;
  location: string | null;
  username: string;
  photoURL: string;
  verified: boolean;
  following: string[];
  followers: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp | null;
  totalTweets: number;
  totalPhotos: number;
  pinnedTweet: string | null;
  coverPhotoURL: string | null;
  /** how often to email a round-up of new posts; undefined means never set */
  emailDigest?: EmailDigestFrequency;
  /** emails about your own activity (new followers, replies, likes, messages); undefined means on */
  emailActivity?: EmailActivitySetting;
  /** when the last activity email was sent (set by the server) */
  activityEmailedAt?: Timestamp | null;
};

export type EmailActivitySetting = 'on' | 'off';

export type EmailDigestFrequency = 'off' | 'daily' | 'weekly';

export type EditableData = Extract<
  keyof User,
  'bio' | 'name' | 'website' | 'photoURL' | 'location' | 'coverPhotoURL'
>;

export type EditableUserData = Pick<User, EditableData>;

export const userConverter: FirestoreDataConverter<User> = {
  toFirestore(user) {
    return { ...user };
  },
  fromFirestore(snapshot, options) {
    const data = snapshot.data(options);
    return { ...data } as User;
  }
};
