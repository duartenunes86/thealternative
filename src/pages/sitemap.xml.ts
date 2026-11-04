import type { GetServerSideProps } from 'next';

const siteURL = process.env.NEXT_PUBLIC_URL ?? 'https://thealternative.social';

/** Sitemaps cap at 50,000 URLs; stay well under and stay fast. */
const MAX_PROFILES = 2000;
const MAX_POSTS = 5000;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Test and throwaway accounts that should never be sent to search engines. */
const JUNK_USERNAMES = new Set(['test', 'search', 'getout']);

function isJunkUsername(username: string): boolean {
  const name = username.toLowerCase();
  return JUNK_USERNAMES.has(name) || /^test[\d_]*$/.test(name);
}

type Entry = { loc: string; lastmod?: string; priority: string };

function renderSitemap(entries: Entry[]): string {
  const urls = entries
    .map(
      ({ loc, lastmod, priority }) =>
        `  <url>\n    <loc>${escapeXml(loc)}</loc>${
          lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''
        }\n    <priority>${priority}</priority>\n  </url>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  res.setHeader('Content-Type', 'text/xml');
  res.setHeader(
    'Cache-Control',
    'public, s-maxage=3600, stale-while-revalidate=86400'
  );

  const entries: Entry[] = [
    { loc: `${siteURL}/`, priority: '1.0' },
    { loc: `${siteURL}/trends`, priority: '0.5' },
    { loc: `${siteURL}/people`, priority: '0.5' }
  ];

  try {
    const { adminDb, isAdminConfigured } = await import('@lib/firebase/admin');

    if (isAdminConfigured()) {
      const db = adminDb();

      const users = await db.collection('users').limit(MAX_PROFILES).get();

      // Only profiles worth a search result: no test/junk accounts and no
      // empty profiles. Their posts are left out too.
      const hidden = new Set<string>();

      users.docs.forEach((doc) => {
        const { username, totalTweets } = doc.data() as {
          username?: string;
          totalTweets?: number;
        };
        if (!username || isJunkUsername(username) || !(totalTweets ?? 0)) {
          hidden.add(doc.id);
          return;
        }
        entries.push({
          loc: `${siteURL}/user/${username}`,
          priority: '0.8'
        });
      });

      // newest posts first — those are the ones worth crawling soonest
      const posts = await db
        .collection('tweets')
        .orderBy('createdAt', 'desc')
        .limit(MAX_POSTS)
        .get();

      posts.docs.forEach((doc) => {
        const { createdAt, createdBy } = doc.data() as {
          createdAt?: { toDate?: () => Date };
          createdBy?: string;
        };

        if (!createdBy || hidden.has(createdBy)) return;

        entries.push({
          loc: `${siteURL}/tweet/${doc.id}`,
          lastmod: createdAt?.toDate?.().toISOString().slice(0, 10),
          priority: '0.6'
        });
      });
    }
  } catch {
    // a partial sitemap beats a 500 — the static entries still ship
  }

  res.write(renderSitemap(entries));
  res.end();

  return { props: {} };
};

export default function Sitemap(): null {
  return null;
}
