import {
  useState,
  useEffect,
  useCallback,
  useContext,
  createContext,
  useMemo
} from 'react';
import {
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut as signOutFirebase,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import { auth } from '@lib/firebase/app';
import {
  usersCollection,
  userStatsCollection,
  userBookmarksCollection
} from '@lib/firebase/collections';
import { getRandomId, getRandomInt } from '@lib/random';
import { checkUsernameAvailability } from '@lib/firebase/utils';
import type { ReactNode } from 'react';
import type { User as AuthUser } from 'firebase/auth';
import type { WithFieldValue } from 'firebase/firestore';
import type { User } from '@lib/types/user';
import type { Bookmark } from '@lib/types/bookmark';
import type { Stats } from '@lib/types/stats';

type AuthContext = {
  user: User | null;
  error: Error | null;
  loading: boolean;
  isAdmin: boolean;
  randomSeed: string;
  userBookmarks: Bookmark[] | null;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUpWithEmail: (name: string, email: string, password: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
};

export const AuthContext = createContext<AuthContext | null>(null);

type AuthContextProviderProps = {
  children: ReactNode;
};

export function AuthContextProvider({
  children
}: AuthContextProviderProps): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [userBookmarks, setUserBookmarks] = useState<Bookmark[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const manageUser = useCallback(async (authUser: AuthUser): Promise<void> => {
    const { uid, displayName, photoURL } = authUser;

    if (!displayName) {
      setLoading(false);
      return;
    }

    let userSnapshot;
    try {
      userSnapshot = await getDoc(doc(usersCollection, uid));
    } catch (err) {
      setError(err as Error);
      setLoading(false);
      return;
    }

    if (!userSnapshot.exists()) {
      let available = false;
      let randomUsername = '';

      while (!available) {
        const normalizeName = displayName.replace(/\s/g, '').toLowerCase();
        const randomInt = getRandomInt(1, 10_000);
        randomUsername = `${normalizeName}${randomInt}`;
        const isUsernameAvailable = await checkUsernameAvailability(randomUsername);
        if (isUsernameAvailable) available = true;
      }

      const userData: WithFieldValue<User> = {
        id: uid,
        bio: null,
        name: displayName,
        theme: null,
        accent: null,
        website: null,
        location: null,
        photoURL: photoURL ?? '/assets/twitter-avatar.jpg',
        username: randomUsername,
        verified: false,
        following: [],
        followers: [],
        createdAt: serverTimestamp(),
        updatedAt: null,
        totalTweets: 0,
        totalPhotos: 0,
        pinnedTweet: null,
        coverPhotoURL: null
      };

      const userStatsData: WithFieldValue<Stats> = {
        likes: [],
        tweets: [],
        updatedAt: null
      };

      try {
        await Promise.all([
          setDoc(doc(usersCollection, uid), userData),
          setDoc(doc(userStatsCollection(uid), 'stats'), userStatsData)
        ]);

        const newUser = (await getDoc(doc(usersCollection, uid))).data();
        setUser(newUser as User);
      } catch (err) {
        setError(err as Error);
      }
    } else {
      const userData = userSnapshot.data();
      setUser(userData);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    const handleUserAuth = (authUser: AuthUser | null): void => {
      setLoading(true);
      if (authUser) void manageUser(authUser);
      else {
        setUser(null);
        setLoading(false);
      }
    };

    const unsubscribe = onAuthStateChanged(auth, handleUserAuth);
    return unsubscribe;
  }, [manageUser]);

  useEffect(() => {
    if (!user) return;

    const { id } = user;

    const unsubscribeUser = onSnapshot(doc(usersCollection, id), (doc) => {
      setUser(doc.data() as User);
    });

    const unsubscribeBookmarks = onSnapshot(
      userBookmarksCollection(id),
      (snapshot) => {
        const bookmarks = snapshot.docs.map((doc) => doc.data());
        setUserBookmarks(bookmarks);
      }
    );

    return () => {
      unsubscribeUser();
      unsubscribeBookmarks();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const signInWithGoogle = async (): Promise<void> => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      setError(err as Error);
    }
  };

  const signUpWithEmail = async (
    name: string,
    email: string,
    password: string
  ): Promise<void> => {
    const { user: authUser } = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );
    await updateProfile(authUser, { displayName: name });
    // updateProfile does not trigger onAuthStateChanged, so call manageUser directly
    // with the now-updated auth user (auth.currentUser has the refreshed profile).
    await manageUser(auth.currentUser ?? authUser);
  };

  const signInWithEmail = async (
    email: string,
    password: string
  ): Promise<void> => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signOut = async (): Promise<void> => {
    try {
      await signOutFirebase(auth);
    } catch (err) {
      setError(err as Error);
    }
  };

  const adminUid = process.env.NEXT_PUBLIC_ADMIN_UID;
  const isAdmin = user && adminUid ? user.id === adminUid : false;
  const randomSeed = useMemo(getRandomId, [user?.id]);

  const value: AuthContext = {
    user,
    error,
    loading,
    isAdmin,
    randomSeed,
    userBookmarks,
    signOut,
    signInWithGoogle,
    signUpWithEmail,
    signInWithEmail
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContext {
  const context = useContext(AuthContext);

  if (!context)
    throw new Error('useAuth must be used within an AuthContextProvider');

  return context;
}
