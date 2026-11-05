import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { HomeLayout, PublicLayout } from '@components/layout/common-layout';
import { MainLayout } from '@components/layout/main-layout';
import { SEO } from '@components/common/seo';
import { MainHeader } from '@components/home/main-header';
import { MainContainer } from '@components/home/main-container';
import { UserAvatar } from '@components/user/user-avatar';
import { SearchBar } from '@components/aside/search-bar';
import { StatsEmpty } from '@components/tweet/stats-empty';
import { Loading } from '@components/ui/loading';
import { Error as ErrorMessage } from '@components/ui/error';
import type { ReactElement, ReactNode } from 'react';
import type { SearchResults } from './api/search';

export default function Search(): JSX.Element {
  const {
    query: { q },
    back
  } = useRouter();

  const term = typeof q === 'string' ? q : '';

  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!term) {
      setResults({ people: [], posts: [] });
      setLoading(false);
      return;
    }

    let active = true;

    setLoading(true);
    setFailed(false);

    const run = async (): Promise<void> => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`);

        if (!response.ok) throw new Error('search failed');

        const data = (await response.json()) as SearchResults;

        if (active) setResults(data);
      } catch {
        if (active) setFailed(true);
      } finally {
        if (active) setLoading(false);
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [term]);

  const people = results?.people ?? [];
  const posts = results?.posts ?? [];
  const nothingFound = !loading && !failed && !people.length && !posts.length;

  return (
    <MainContainer>
      <SEO
        title={
          term
            ? `${term} - Search / The Alternative`
            : 'Search / The Alternative'
        }
      />
      <MainHeader useActionButton title='Search' action={back} />
      {/* the sidebar search box is hidden below 1024px, so the page carries
          its own — otherwise search is unreachable on a phone */}
      <div className='px-4 py-3 lg:hidden'>
        <SearchBar />
      </div>
      <section className='mt-0.5'>
        {loading ? (
          <Loading className='mt-5' />
        ) : failed ? (
          <ErrorMessage message='Search is unavailable right now' />
        ) : nothingFound ? (
          <StatsEmpty
            title={term ? `No results for "${term}"` : 'Search The Alternative'}
            description={
              term
                ? 'Try a different name, username or word.'
                : 'Look for people and posts by name, username or text.'
            }
          />
        ) : (
          <>
            {people.length > 0 && (
              <>
                <h2 className='px-4 py-3 text-xl font-bold'>People</h2>
                {people.map(
                  ({ id, name, username, photoURL, bio }) => (
                    <Link href={`/user/${username}`} key={id}>
                      <a
                        className='accent-tab hover-animation grid grid-cols-[auto,1fr] gap-3 border-b
                                   border-light-border px-4 py-3 hover:bg-light-primary/5
                                   dark:border-dark-border dark:hover:bg-dark-primary/5'
                      >
                        <UserAvatar
                          src={photoURL ?? '/assets/twitter-avatar.jpg'}
                          alt={name}
                        />
                        <div className='flex flex-col truncate'>
                          <span className='font-bold'>{name}</span>
                          <span className='text-light-secondary dark:text-dark-secondary'>
                            @{username}
                          </span>
                          {bio && <p className='mt-1 truncate'>{bio}</p>}
                        </div>
                      </a>
                    </Link>
                  )
                )}
              </>
            )}
            {posts.length > 0 && (
              <>
                <h2 className='px-4 py-3 text-xl font-bold'>Posts</h2>
                {posts.map(
                  ({ id, text, authorName, authorUsername, authorPhotoURL }) => (
                    <Link href={`/tweet/${id}`} key={id}>
                      <a
                        className='accent-tab hover-animation grid grid-cols-[auto,1fr] gap-3 border-b
                                   border-light-border px-4 py-3 hover:bg-light-primary/5
                                   dark:border-dark-border dark:hover:bg-dark-primary/5'
                      >
                        <UserAvatar
                          src={authorPhotoURL ?? '/assets/twitter-avatar.jpg'}
                          alt={authorName}
                        />
                        <div className='flex flex-col truncate'>
                          <span className='truncate'>
                            <span className='font-bold'>{authorName}</span>{' '}
                            <span className='text-light-secondary dark:text-dark-secondary'>
                              @{authorUsername}
                            </span>
                          </span>
                          <p className='whitespace-pre-line break-words'>
                            {text.length > 220
                              ? `${text.slice(0, 220)}…`
                              : text}
                          </p>
                        </div>
                      </a>
                    </Link>
                  )
                )}
              </>
            )}
          </>
        )}
      </section>
    </MainContainer>
  );
}

Search.getLayout = (page: ReactElement): ReactNode => (
  <PublicLayout>
    <MainLayout>
      <HomeLayout>{page}</HomeLayout>
    </MainLayout>
  </PublicLayout>
);
