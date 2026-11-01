import { doc, query, where } from 'firebase/firestore';
import { AnimatePresence } from 'framer-motion';
import { useUser } from '@lib/context/user-context';
import { useCollection } from '@lib/hooks/useCollection';
import { useDocument } from '@lib/hooks/useDocument';
import { tweetsCollection } from '@lib/firebase/collections';
import { mergeData } from '@lib/merge';
import { UserLayout, PublicLayout } from '@components/layout/common-layout';
import { MainLayout } from '@components/layout/main-layout';
import { UserDataLayout } from '@components/layout/user-data-layout';
import { UserHomeLayout } from '@components/layout/user-home-layout';
import { StatsEmpty } from '@components/tweet/stats-empty';
import { Loading } from '@components/ui/loading';
import { Tweet } from '@components/tweet/tweet';
import { SEO } from '@components/common/seo';
import type { ReactElement, ReactNode } from 'react';
import type { GetServerSideProps } from 'next';

type ProfilePreview = {
  name: string;
  username: string;
  bio: string | null;
  photoURL: string | null;
};

/**
 * The route param is the username, so the profile is looked up by that.
 * Rendered server-side so search engines and link previews see the real
 * name, bio and avatar without executing any JavaScript.
 */
export const getServerSideProps: GetServerSideProps<{
  preview: ProfilePreview | null;
}> = async ({ params, res }) => {
  res.setHeader(
    'Cache-Control',
    'public, s-maxage=300, stale-while-revalidate=600'
  );

  const username = typeof params?.id === 'string' ? params.id : null;

  if (!username) return { props: { preview: null } };

  try {
    const { adminDb, isAdminConfigured } = await import('@lib/firebase/admin');

    if (!isAdminConfigured()) return { props: { preview: null } };

    const snapshot = await adminDb()
      .collection('users')
      .where('username', '==', username)
      .limit(1)
      .get();

    if (snapshot.empty) return { props: { preview: null } };

    const data = snapshot.docs[0].data() as {
      name?: string;
      username?: string;
      bio?: string | null;
      photoURL?: string | null;
    };

    return {
      props: {
        preview: {
          name: data.name ?? username,
          username: data.username ?? username,
          bio: data.bio ?? null,
          photoURL: data.photoURL ?? null
        }
      }
    };
  } catch {
    return { props: { preview: null } };
  }
};

export default function UserTweets({
  preview
}: {
  preview: ProfilePreview | null;
}): JSX.Element {
  const { user } = useUser();

  const { id, username, pinnedTweet } = user ?? {};

  const { data: pinnedData } = useDocument(
    doc(tweetsCollection, pinnedTweet ?? 'null'),
    {
      disabled: !pinnedTweet,
      allowNull: true,
      includeUser: true
    }
  );

  const { data: ownerTweets, loading: ownerLoading } = useCollection(
    query(
      tweetsCollection,
      where('createdBy', '==', id),
      where('parent', '==', null)
    ),
    { includeUser: true, allowNull: true }
  );

  const { data: peopleTweets, loading: peopleLoading } = useCollection(
    query(
      tweetsCollection,
      where('createdBy', '!=', id),
      where('userRetweets', 'array-contains', id)
    ),
    { includeUser: true, allowNull: true }
  );

  const mergedTweets = mergeData(true, ownerTweets, peopleTweets);

  return (
    <section>
      {ownerLoading || peopleLoading ? (
        <Loading className='mt-5' />
      ) : !mergedTweets ? (
        <StatsEmpty
          title={`@${username as string} hasn't tweeted`}
          description='When they do, their Tweets will show up here.'
        />
      ) : (
        <AnimatePresence mode='popLayout'>
          {pinnedData && (
            <Tweet pinned {...pinnedData} key={`pinned-${pinnedData.id}`} />
          )}
          {mergedTweets.map((tweet) => (
            <Tweet {...tweet} profile={user} key={tweet.id} />
          ))}
        </AnimatePresence>
      )}
    </section>
  );
}

/**
 * The SEO tags are rendered here rather than inside the page, because
 * UserHomeLayout shows a spinner instead of its children until the client
 * side Firestore read resolves — which on the server is never, so anything
 * rendered by the page itself is invisible to crawlers.
 */
UserTweets.getLayout = (page: ReactElement): ReactNode => {
  const { preview } = (page.props ?? {}) as { preview?: ProfilePreview | null };

  return (
    <PublicLayout>
      {preview && (
        <SEO
          title={`${preview.name} (@${preview.username}) / The Alternative`}
          description={
            preview.bio ??
            `${preview.name} (@${preview.username}) on The Alternative.`
          }
          image={preview.photoURL ?? undefined}
        />
      )}
      <MainLayout>
        <UserLayout>
          <UserDataLayout>
            <UserHomeLayout>{page}</UserHomeLayout>
          </UserDataLayout>
        </UserLayout>
      </MainLayout>
    </PublicLayout>
  );
};
