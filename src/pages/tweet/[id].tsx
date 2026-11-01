import { useRef } from 'react';
import { useRouter } from 'next/router';
import { AnimatePresence } from 'framer-motion';
import { doc, query, where, orderBy } from 'firebase/firestore';
import { tweetsCollection } from '@lib/firebase/collections';
import { useCollection } from '@lib/hooks/useCollection';
import { useDocument } from '@lib/hooks/useDocument';
import { isPlural } from '@lib/utils';
import { HomeLayout, PublicLayout } from '@components/layout/common-layout';
import { MainLayout } from '@components/layout/main-layout';
import { MainContainer } from '@components/home/main-container';
import { MainHeader } from '@components/home/main-header';
import { Tweet } from '@components/tweet/tweet';
import { ViewTweet } from '@components/view/view-tweet';
import { SEO } from '@components/common/seo';
import { Loading } from '@components/ui/loading';
import { Error } from '@components/ui/error';
import { ViewParentTweet } from '@components/view/view-parent-tweet';
import type { ReactElement, ReactNode } from 'react';
import type { GetServerSideProps } from 'next';

type TweetPreview = {
  text: string | null;
  authorName: string;
  authorUsername: string;
  image: string | null;
};

/**
 * Fetched on the server so the page ships real <title> and og: tags in its
 * first response. Social crawlers (WhatsApp, Facebook, LinkedIn, Slack) never
 * run JavaScript, so without this a shared link previews as an empty shell.
 */
export const getServerSideProps: GetServerSideProps<{
  preview: TweetPreview | null;
}> = async ({ params, res }) => {
  // let search engines and link previews cache briefly, cheap for repeat hits
  res.setHeader(
    'Cache-Control',
    'public, s-maxage=300, stale-while-revalidate=600'
  );

  const id = typeof params?.id === 'string' ? params.id : null;

  if (!id) return { props: { preview: null } };

  try {
    // imported lazily so the client bundle never pulls in firebase-admin
    const { adminDb, isAdminConfigured } = await import('@lib/firebase/admin');

    if (!isAdminConfigured()) return { props: { preview: null } };

    const snapshot = await adminDb().doc(`tweets/${id}`).get();

    if (!snapshot.exists) return { props: { preview: null } };

    const data = snapshot.data() as {
      text?: string | null;
      createdBy?: string;
      images?: { src: string }[] | null;
    };

    const author = (
      await adminDb().doc(`users/${data.createdBy ?? ''}`).get()
    ).data() as { name?: string; username?: string } | undefined;

    return {
      props: {
        preview: {
          text: data.text ?? null,
          authorName: author?.name ?? 'Someone',
          authorUsername: author?.username ?? 'unknown',
          image: data.images?.[0]?.src ?? null
        }
      }
    };
  } catch {
    // never let a metadata lookup take the page down
    return { props: { preview: null } };
  }
};

export default function TweetId({
  preview
}: {
  preview: TweetPreview | null;
}): JSX.Element {
  const {
    query: { id },
    back
  } = useRouter();

  const { data: tweetData, loading: tweetLoading } = useDocument(
    doc(tweetsCollection, id as string),
    { includeUser: true, allowNull: true }
  );

  const viewTweetRef = useRef<HTMLElement>(null);

  const { data: repliesData, loading: repliesLoading } = useCollection(
    query(
      tweetsCollection,
      where('parent.id', '==', id),
      orderBy('createdAt', 'desc')
    ),
    { includeUser: true, allowNull: true }
  );

  const { text, images } = tweetData ?? {};

  const imagesLength = images?.length ?? 0;
  const parentId = tweetData?.parent?.id;

  const pageTitle = tweetData
    ? `${tweetData.user.name} on The Alternative: "${text ?? ''}${
        images ? ` (${imagesLength} image${isPlural(imagesLength)})` : ''
      }" / The Alternative`
    : null;

  return (
    <MainContainer className='!pb-[1280px]'>
      {/* Rendered on the server from `preview`, so crawlers get real metadata
          immediately rather than waiting on a client-side Firestore read. */}
      {preview && (
        <SEO
          title={`${preview.authorName} on The Alternative: "${
            preview.text ?? ''
          }" / The Alternative`}
          description={preview.text ?? `A post by @${preview.authorUsername}`}
          image={preview.image ?? undefined}
        />
      )}
      <MainHeader
        useActionButton
        title={parentId ? 'Thread' : 'Post'}
        action={back}
      />
      <section>
        {tweetLoading ? (
          <Loading className='mt-5' />
        ) : !tweetData ? (
          <>
            {!preview && <SEO title='Post not found / The Alternative' />}
            <Error message='Post not found' />
          </>
        ) : (
          <>
            {!preview && pageTitle && <SEO title={pageTitle} />}
            {parentId && (
              <ViewParentTweet
                parentId={parentId}
                viewTweetRef={viewTweetRef}
              />
            )}
            <ViewTweet viewTweetRef={viewTweetRef} {...tweetData} />
            {tweetData &&
              (repliesLoading ? (
                <Loading className='mt-5' />
              ) : (
                <AnimatePresence mode='popLayout'>
                  {repliesData?.map((tweet) => (
                    <Tweet {...tweet} key={tweet.id} />
                  ))}
                </AnimatePresence>
              ))}
          </>
        )}
      </section>
    </MainContainer>
  );
}

TweetId.getLayout = (page: ReactElement): ReactNode => (
  <PublicLayout>
    <MainLayout>
      <HomeLayout>{page}</HomeLayout>
    </MainLayout>
  </PublicLayout>
);
