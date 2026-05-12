import Head from 'next/head';

export function AppHead(): JSX.Element {
  return (
    <Head>
      <title>The Alternative</title>
      <meta name='og:title' content='The Alternative' />
      <meta name='og:description' content='Your social network. Join The Alternative at thealternative.social' />
      <meta property='og:image' content='https://thealternative.social/home.png' />
      <meta name='twitter:card' content='summary_large_image' />
      <meta name='twitter:image' content='https://thealternative.social/home.png' />
      <link rel='icon' type='image/svg+xml' href='/favicon.svg' />
      <link rel='icon' href='/favicon.ico' />
      <link rel='manifest' href='/site.webmanifest' key='site-manifest' />
    </Head>
  );
}
