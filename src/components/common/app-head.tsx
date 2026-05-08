import Head from 'next/head';

export function AppHead(): JSX.Element {
  return (
    <Head>
      <title>The Alternative</title>
      <meta name='og:title' content='The Alternative' />
      <link rel='icon' type='image/svg+xml' href='/favicon.svg' />
      <link rel='icon' href='/favicon.ico' />
      <link rel='manifest' href='/site.webmanifest' key='site-manifest' />
      <meta name='twitter:site' content='@ccrsxx' />
      <meta name='twitter:card' content='summary_large_image' />
    </Head>
  );
}
