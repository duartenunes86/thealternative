import Link from 'next/link';
import cn from 'clsx';
import { formatDate } from '@lib/date';
import { UserAvatar } from '@components/user/user-avatar';
import type { Conversation } from '@lib/types/message';
import type { User } from '@lib/types/user';

type ConversationRowProps = {
  conversation: Conversation;
  other: User | null;
  me: string;
};

export function ConversationRow({ conversation, other, me }: ConversationRowProps): JSX.Element {
  const unread = conversation.unread?.[me] ?? 0;
  const last = conversation.lastMessage;

  return (
    <Link href={`/messages/${conversation.id}`}>
      <a
        className='accent-tab hover-card flex items-center gap-3 border-b border-light-border px-4 py-3
                   outline-none dark:border-dark-border'
      >
        <UserAvatar src={other?.photoURL ?? ''} alt={other?.name ?? 'User'} />
        <div className='min-w-0 flex-1'>
          <div className='flex items-baseline justify-between gap-2'>
            <p className={cn('truncate', unread ? 'font-bold' : 'font-medium')}>
              {other?.name ?? 'Someone'}{' '}
              <span className='font-normal text-light-secondary dark:text-dark-secondary'>
                @{other?.username ?? 'unknown'}
              </span>
            </p>
            {last?.createdAt && (
              <span className='shrink-0 text-sm text-light-secondary dark:text-dark-secondary'>
                {formatDate(last.createdAt, 'message')}
              </span>
            )}
          </div>
          <div className='flex items-center justify-between gap-2'>
            <p
              className={cn(
                'truncate text-sm',
                unread ? 'font-semibold' : 'text-light-secondary dark:text-dark-secondary'
              )}
            >
              {last ? `${last.from === me ? 'You: ' : ''}${last.text}` : 'No messages yet'}
            </p>
            {unread > 0 && (
              <span
                className='flex h-5 min-w-[20px] items-center justify-center rounded-full bg-main-accent
                           px-1.5 text-xs font-bold text-white'
                aria-label={`${unread} unread`}
              >
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </div>
        </div>
      </a>
    </Link>
  );
}
