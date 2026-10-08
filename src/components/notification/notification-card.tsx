import Link from 'next/link';
import cn from 'clsx';
import { UserAvatar } from '@components/user/user-avatar';
import { HeroIcon } from '@components/ui/hero-icon';
import type { Notification } from '@lib/types/notification';
import type { User } from '@lib/types/user';
import type { IconName } from '@components/ui/hero-icon';

type NotificationCardProps = {
  notification: Notification;
  user: User | null;
};

const notificationCopy: Record<
  Notification['type'],
  { icon: IconName; color: string; text: string }
> = {
  like: {
    icon: 'HeartIcon',
    color: 'text-accent-pink',
    text: 'liked your post'
  },
  reply: {
    icon: 'ChatBubbleOvalLeftIcon',
    color: 'text-accent-blue',
    text: 'replied to your post'
  },
  follow: {
    icon: 'UserIcon',
    color: 'text-main-accent',
    text: 'followed you'
  }
};

export function NotificationCard({
  notification,
  user
}: NotificationCardProps): JSX.Element {
  const { type, tweetId, parentTweetId, read } = notification;

  const { icon, color, text } = notificationCopy[type];

  // likes point at the liked post, replies at the reply itself
  const href =
    type === 'follow'
      ? user
        ? `/user/${user.username}`
        : '#'
      : `/tweet/${(type === 'reply' ? tweetId : tweetId ?? parentTweetId) ?? ''}`;

  return (
    <Link href={href}>
      <a
        className={cn(
          `accent-tab hover-animation flex gap-3 border-b border-light-border
           px-4 py-3 dark:border-dark-border`,
          !read && 'bg-main-accent/5'
        )}
      >
        <i className={cn('mt-1', color)}>
          <HeroIcon className='h-6 w-6' iconName={icon} solid />
        </i>
        <div className='flex flex-col gap-1'>
          <UserAvatar
            src={user?.photoURL ?? '/assets/twitter-avatar.jpg'}
            alt={user?.name ?? 'User'}
            size={32}
          />
          <p className='text-light-secondary dark:text-dark-secondary'>
            <span className='font-bold text-light-primary dark:text-dark-primary'>
              {user?.name ?? 'Someone'}
            </span>{' '}
            {text}
          </p>
        </div>
        {!read && (
          <i className='ml-auto mt-2 h-2 w-2 shrink-0 rounded-full bg-main-accent' />
        )}
      </a>
    </Link>
  );
}
