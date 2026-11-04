import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import cn from 'clsx';
import { toast } from 'react-hot-toast';
import { doc, query, orderBy, limitToLast } from 'firebase/firestore';
import { useAuth } from '@lib/context/auth-context';
import { useDocument } from '@lib/hooks/useDocument';
import { useCollection } from '@lib/hooks/useCollection';
import {
  usersCollection,
  conversationsCollection,
  conversationMessagesCollection
} from '@lib/firebase/collections';
import {
  openConversation,
  sendMessage,
  markConversationRead,
  setConversationBlocked,
  deleteMyMessage
} from '@lib/firebase/utils';
import { formatDate } from '@lib/date';
import { MAX_MESSAGE_LENGTH } from '@lib/types/message';
import { HomeLayout, ProtectedLayout } from '@components/layout/common-layout';
import { MainLayout } from '@components/layout/main-layout';
import { SEO } from '@components/common/seo';
import { MainHeader } from '@components/home/main-header';
import { MainContainer } from '@components/home/main-container';
import { UserAvatar } from '@components/user/user-avatar';
import { Button } from '@components/ui/button';
import { HeroIcon } from '@components/ui/hero-icon';
import { ToolTip } from '@components/ui/tooltip';
import { Loading } from '@components/ui/loading';
import type { ReactElement, ReactNode, KeyboardEvent, FormEvent } from 'react';

export default function Conversation(): JSX.Element {
  const { user } = useAuth();
  const router = useRouter();
  const me = user?.id ?? '';
  const id = typeof router.query.id === 'string' ? router.query.id : '';

  const parts = id.split('__');
  const valid = parts.length === 2 && parts.includes(me) && parts[0] !== parts[1];
  const otherId = valid ? parts.find((p) => p !== me) ?? '' : '';

  const [ready, setReady] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // make sure the conversation exists before listening to it
  useEffect(() => {
    if (!me || !id) return;
    if (!valid) {
      void router.replace('/messages');
      return;
    }
    openConversation(me, otherId)
      .then(() => setReady(true))
      .catch(() => toast.error('Could not open this conversation'));
  }, [me, id, valid, otherId, router]);

  const { data: conversation } = useDocument(doc(conversationsCollection, id || '-'), {
    allowNull: true,
    disabled: !ready
  });

  const { data: other } = useDocument(doc(usersCollection, otherId || '-'), {
    allowNull: true,
    disabled: !otherId
  });

  const { data: messages, loading } = useCollection(
    query(conversationMessagesCollection(id || '-'), orderBy('createdAt', 'asc'), limitToLast(300)),
    { allowNull: true, disabled: !ready, preserve: true }
  );

  const unreadForMe = conversation?.unread?.[me] ?? 0;

  useEffect(() => {
    if (ready && unreadForMe > 0) void markConversationRead(id, me);
  }, [ready, unreadForMe, id, me, messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages?.length]);

  const blockedByMe = !!conversation?.blockedBy?.includes(me);
  const blockedByOther = !!conversation?.blockedBy?.some((uid) => uid !== me);
  const blocked = blockedByMe || blockedByOther;

  const handleSend = async (event?: FormEvent): Promise<void> => {
    event?.preventDefault();
    const value = text.trim();
    if (!value || sending || blocked) return;
    setSending(true);
    try {
      await sendMessage(id, me, otherId, value);
      setText('');
    } catch {
      toast.error('Your message was not sent. Try again.');
    } finally {
      setSending(false);
    }
  };

  const handleKey = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const toggleBlock = async (): Promise<void> => {
    try {
      await setConversationBlocked(id, me, !blockedByMe);
      toast.success(blockedByMe ? 'Unblocked. You can message each other again.' : 'Blocked. Neither of you can send messages here.');
    } catch {
      toast.error('Could not change the block setting');
    }
  };

  const days = useMemo(() => {
    const groups: { label: string; items: NonNullable<typeof messages> }[] = [];
    (messages ?? []).forEach((message) => {
      const date = message.createdAt?.toDate?.() ?? new Date();
      const label = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(message);
      else groups.push({ label, items: [message] });
    });
    return groups;
  }, [messages]);

  return (
    <MainContainer className='flex min-h-screen flex-col'>
      <SEO title={`${other?.name ?? 'Messages'} / The Alternative`} />
      <MainHeader
        useActionButton
        action={(): void => void router.push('/messages')}
        className='flex items-center justify-between gap-4'
      >
        <Link href={other ? `/user/${other.username}` : '#'}>
          <a className='flex min-w-0 flex-1 items-center gap-3 outline-none'>
            <UserAvatar src={other?.photoURL ?? ''} alt={other?.name ?? ''} size={32} />
            <div className='min-w-0'>
              <p className='truncate font-bold leading-5'>{other?.name ?? ' '}</p>
              <p className='truncate text-sm text-light-secondary dark:text-dark-secondary'>
                @{other?.username ?? ''}
              </p>
            </div>
          </a>
        </Link>
        <Button
          className='dark-bg-tab group relative p-2 hover:bg-light-primary/10 active:bg-light-primary/20
                     dark:hover:bg-dark-primary/10 dark:active:bg-dark-primary/20'
          onClick={toggleBlock}
        >
          <HeroIcon className='h-5 w-5' iconName='NoSymbolIcon' />
          <ToolTip
            className='!-translate-x-20 translate-y-3 md:-translate-x-1/2'
            tip={blockedByMe ? 'Unblock' : 'Block'}
          />
        </Button>
      </MainHeader>
      <section className='flex flex-1 flex-col gap-1 px-4 py-4'>
        {(!ready || (loading && !messages)) && <Loading className='mt-5' />}
        {ready && messages && !messages.length && (
          <p className='mt-10 text-center text-light-secondary dark:text-dark-secondary'>
            Say hello to {other?.name ?? 'them'}. Messages here are only visible to the two of you.
          </p>
        )}
        {days.map(({ label, items }) => (
          <div key={label} className='flex flex-col gap-1'>
            <p className='my-3 text-center text-xs font-medium text-light-secondary dark:text-dark-secondary'>
              {label}
            </p>
            {items.map((message) => {
              const mine = message.from === me;
              return (
                <div
                  key={message.id}
                  className={cn('group flex items-end gap-2', mine ? 'flex-row-reverse' : 'flex-row')}
                >
                  <div
                    className={cn(
                      'max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2',
                      mine
                        ? 'rounded-br-md bg-main-accent text-white'
                        : 'rounded-bl-md bg-light-line-reply/40 dark:bg-dark-line-reply/60'
                    )}
                  >
                    {message.text}
                  </div>
                  <span className='mb-1 text-xs text-light-secondary dark:text-dark-secondary'>
                    {message.createdAt ? formatDate(message.createdAt, 'message') : 'Sending…'}
                  </span>
                  {mine && message.createdAt && (
                    <button
                      type='button'
                      className='mb-1 hidden text-xs text-light-secondary hover:text-accent-red group-hover:inline
                                 group-focus-within:inline dark:text-dark-secondary'
                      onClick={(): void =>
                        void deleteMyMessage(id, message.id).catch(() =>
                          toast.error('Could not delete the message')
                        )
                      }
                    >
                      Delete
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </section>
      <form
        onSubmit={handleSend}
        className='sticky bottom-0 flex items-end gap-2 border-t border-light-border bg-main-background
                   px-4 py-3 dark:border-dark-border'
      >
        {blocked ? (
          <p className='flex-1 py-2 text-center text-sm text-light-secondary dark:text-dark-secondary'>
            {blockedByMe ? 'You blocked this conversation. Unblock it to send messages.' : 'You can’t reply to this conversation.'}
          </p>
        ) : (
          <>
            <label htmlFor='message-input' className='sr-only'>
              Message
            </label>
            <textarea
              id='message-input'
              className='max-h-40 min-h-[44px] flex-1 resize-none rounded-2xl border border-light-border
                         bg-transparent px-4 py-2.5 outline-none focus:border-main-accent dark:border-dark-border'
              rows={1}
              maxLength={MAX_MESSAGE_LENGTH}
              placeholder='Write a message'
              value={text}
              onChange={({ target: { value } }): void => setText(value)}
              onKeyDown={handleKey}
            />
            <Button
              type='submit'
              className='accent-tab bg-main-accent px-4 py-2 font-bold text-white hover:brightness-90
                         disabled:brightness-75'
              disabled={!text.trim() || sending}
            >
              Send
            </Button>
          </>
        )}
      </form>
    </MainContainer>
  );
}

Conversation.getLayout = (page: ReactElement): ReactNode => (
  <ProtectedLayout>
    <MainLayout>
      <HomeLayout>{page}</HomeLayout>
    </MainLayout>
  </ProtectedLayout>
);
