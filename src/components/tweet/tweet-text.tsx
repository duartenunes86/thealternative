import { useState, useEffect } from 'react';

type TweetTextProps = {
  text: string;
};

const URL_REGEX = /https?:\/\/[^\s]+/g;

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0];
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return v;
      if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2];
    }
  } catch (_) {
    return null;
  }
  return null;
}

type YoutubeEmbedProps = {
  videoId: string;
  url: string;
};

function YoutubeEmbed({ videoId, url }: YoutubeEmbedProps): JSX.Element {
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    )
      .then((r) => r.json())
      .then((data: { title?: string }) => {
        if (data.title) setTitle(data.title);
      })
      .catch(() => null);
  }, [url]);

  return (
    <div className='mt-2 overflow-hidden rounded-2xl border border-light-border dark:border-dark-border'>
      {title && (
        <div className='bg-main-sidebar-background px-3 py-2 text-sm font-bold text-light-primary dark:text-dark-primary'>
          {title}
        </div>
      )}
      <iframe
        src={`https://www.youtube.com/embed/${videoId}`}
        className='aspect-video w-full'
        allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
        allowFullScreen
        title={title ?? 'YouTube video'}
      />
    </div>
  );
}

export function TweetText({ text }: TweetTextProps): JSX.Element {
  const urls = text.match(URL_REGEX) ?? [];

  let youtubeId: string | null = null;
  let youtubeUrl: string | null = null;
  for (const url of urls) {
    const id = extractYouTubeId(url);
    if (id) {
      youtubeId = id;
      youtubeUrl = url;
      break;
    }
  }

  const parts = text.split(URL_REGEX);
  const matches = Array.from(text.matchAll(new RegExp(URL_REGEX)));

  const nodes: JSX.Element[] = [];
  parts.forEach((part, i) => {
    if (part) nodes.push(<span key={`t${i}`}>{part}</span>);
    const match = matches[i];
    if (match) {
      const url = String(match[0]);
      nodes.push(
        <a
          key={`u${i}`}
          href={url}
          target='_blank'
          rel='noopener noreferrer'
          className='text-accent-blue hover:underline'
          onClick={(e: React.MouseEvent): void => e.stopPropagation()}
        >
          {url}
        </a>
      );
    }
  });

  return (
    <>
      <p className='whitespace-pre-line break-words'>{nodes}</p>
      {youtubeId && youtubeUrl && (
        <YoutubeEmbed videoId={youtubeId} url={youtubeUrl} />
      )}
    </>
  );
}
