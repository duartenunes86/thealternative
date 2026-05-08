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

export function TweetText({ text }: TweetTextProps): JSX.Element {
  const urls = text.match(URL_REGEX) ?? [];
  const youtubeId = urls.map(extractYouTubeId).find(Boolean) ?? null;

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
      {youtubeId && (
        <div className='mt-2 overflow-hidden rounded-2xl'>
          <iframe
            src={`https://www.youtube.com/embed/${youtubeId}`}
            className='aspect-video w-full'
            allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
            allowFullScreen
            title='YouTube video'
          />
        </div>
      )}
    </>
  );
}
