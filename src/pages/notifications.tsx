import { useMemo, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { orderBy, query, limit } from 'firebase/firestore';
import { useAuth } from '@lib/context/auth-context';
import { useModal } from '@lib/hooks/useModal';
import { useCollection } from '@lib/hooks/useCollection';
import { useArrayDocument } from '@lib/hooks/useArrayDocument';
import { usePushNotifications } from '@lib/hooks/usePushNotifications';
import {
  markNotificationsAsRead,
  clearAllNotifications
} from '@lib/firebase/utils';
import {
  usersCollection,
  userNotificationsCollection
} from '@lib/firebase/collections';
import { HomeLayout, ProtectedLayout } from '@components/layout/common-layout';
import { MainLayout } from '@components/layout/main-layout';
import { SEO } from '@components/common/seo';
import { MainHeader } from '@components/home/main-header';
import { MainContainer } from '@components/home/main-container';
import { Modal } from '@components/modal/modal';
import { ActionModal } from '@components/modal/action-modal';
import { NotificationCard } from '@components/notification/notification-card';
import { EmailDigestSettings } from '@components/notification/email-digest-settings';
import { StatsEmpty } from '@components/tweet/stats-empty';
import { Button } from '@components/ui/button';
import { ToolTip } from '@components/ui/tooltip';
import { HeroIcon } from '@components/ui/hero-icon';
import { Loading } from '@components/ui/loading';
import type { ReactElement, ReactNode } from 'react';
import type { User } from '@lib/types/user';

export default function Notifications(): JSX.Element {
  const { user } = useAuth();

  const { open, openModal, closeModal } = useModal();

  const userId = user?.id as string;

  const { data: notifications, loading: notificationsLoading } = useCollection(
    query(
      userNotificationsCollection(userId),
      orderBy('createdAt', 'desc'),
      limit(100)
    ),
    { allowNull: true }
  );

  const senderIds = useMemo(
    () =>
      Array.from(
        new Set(notifications?.map(({ fromUserId }) => fromUserId) ?? [])
      ),
    [notifications]
  );

  const { data: senders, loading: sendersLoading } = useArrayDocument(
    senderIds,
    usersCollection,
    { disabled: !senderIds.length }
  );

  const sendersById = useMemo(() => {
    const map = new Map<string, User>();
    senders?.forEach((sender) => map.set(sender.id, sender));
    return map;
  }, [senders]);

  // mark everything on screen as read once it has been displayed
  useEffect(() => {
    if (!userId || !notifications) return;

    const unreadIds = notifications
      .filter(({ read }) => !read)
      .map(({ id }) => id);

    if (unreadIds.length) void markNotificationsAsRead(userId, unreadIds);
  }, [userId, notifications]);

  const {
    supported: pushSupported,
    enabled: pushEnabled,
    loading: pushLoading,
    enable: enablePush
  } = usePushNotifications(userId ?? null);

  const handleEnablePush = async (): Promise<void> => {
    const granted = await enablePush();

    if (granted) toast.success('Push notifications are on for this device');
    else
      toast.error(
        'Could not enable push notifications. Check your browser permissions.'
      );
  };

  const handleClear = async (): Promise<void> => {
    await clearAllNotifications(userId);
    closeModal();
    toast.success('Successfully cleared all notifications');
  };

  const loading = notificationsLoading || sendersLoading;

  return (
    <MainContainer>
      <SEO title='Notifications / The Alternative' />
      <Modal
        modalClassName='max-w-xs bg-main-background w-full p-8 rounded-2xl'
        open={open}
        closeModal={closeModal}
      >
        <ActionModal
          title='Clear all notifications?'
          description='This can’t be undone and you’ll remove all of your notifications.'
          mainBtnClassName='bg-accent-red hover:bg-accent-red/90 active:bg-accent-red/75 accent-tab
                            focus-visible:bg-accent-red/90'
          mainBtnLabel='Clear'
          action={handleClear}
          closeModal={closeModal}
        />
      </Modal>
      <MainHeader className='flex items-center justify-between'>
        <div className='-mb-1 flex flex-col'>
          <h2 className='-mt-1 text-xl font-bold'>Notifications</h2>
          <p className='text-xs text-light-secondary dark:text-dark-secondary'>
            @{user?.username}
          </p>
        </div>
        <div className='flex items-center'>
          {pushSupported && !pushEnabled && (
            <Button
              className='dark-bg-tab group relative p-2 hover:bg-light-primary/10
                         active:bg-light-primary/20 dark:hover:bg-dark-primary/10
                         dark:active:bg-dark-primary/20'
              loading={pushLoading}
              onClick={handleEnablePush}
            >
              <HeroIcon className='h-5 w-5' iconName='BellAlertIcon' />
              <ToolTip
                className='!-translate-x-20 translate-y-3 md:-translate-x-1/2'
                tip='Enable push notifications'
              />
            </Button>
          )}
          <Button
            className='dark-bg-tab group relative p-2 hover:bg-light-primary/10
                       active:bg-light-primary/20 dark:hover:bg-dark-primary/10
                       dark:active:bg-dark-primary/20'
            onClick={openModal}
          >
            <HeroIcon className='h-5 w-5' iconName='ArchiveBoxXMarkIcon' />
            <ToolTip
              className='!-translate-x-20 translate-y-3 md:-translate-x-1/2'
              tip='Clear notifications'
            />
          </Button>
        </div>
      </MainHeader>
      {userId && (
        <EmailDigestSettings
          userId={userId}
          current={user?.emailDigest ?? 'weekly'}
        />
      )}
      <section className='mt-0.5'>
        {loading ? (
          <Loading className='mt-5' />
        ) : !notifications?.length ? (
          <StatsEmpty
            title='Nothing to see here — yet'
            description='When someone likes or replies to your posts, or follows you, it’ll show up here.'
          />
        ) : (
          <AnimatePresence mode='popLayout'>
            {notifications.map((notification) => (
              <NotificationCard
                notification={notification}
                user={sendersById.get(notification.fromUserId) ?? null}
                key={notification.id}
              />
            ))}
          </AnimatePresence>
        )}
      </section>
    </MainContainer>
  );
}

Notifications.getLayout = (page: ReactElement): ReactNode => (
  <ProtectedLayout>
    <MainLayout>
      <HomeLayout>{page}</HomeLayout>
    </MainLayout>
  </ProtectedLayout>
);
