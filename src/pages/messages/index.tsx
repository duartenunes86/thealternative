import { useMemo } from 'react';
import { useAuth } from '@lib/context/auth-context';
import { useConversations } from '@lib/hooks/useConversations';
import { useArrayDocument } from '@lib/hooks/useArrayDocument';
import { usersCollection } from '@lib/firebase/collections';
import { otherParticipant } from '@lib/types/message';
import { HomeLayout, ProtectedLayout } from '@components/layout/common-layout';
import { MainLayout } from '@components/layout/main-layout';
import { SEO } from '@components/common/seo';
import { MainHeader } from '@components/home/main-header';
import { MainContainer } from '@components/home/main-container';
import { ConversationRow } from '@components/message/conversation-row';
import { StatsEmpty } from '@components/tweet/stats-empty';
import { Loading } from '@components/ui/loading';
import type { ReactElement, ReactNode } from 'react';
import type { User } from '@lib/types/user';

export default function Messages(): JSX.Element {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const { conversations, loading } = useConversations(userId);

  const otherIds = useMemo(
    () => Array.from(new Set((conversations ?? []).map((c) => otherParticipant(c, userId ?? '')))),
    [conversations, userId]
  );

  const { data: others } = useArrayDocument(otherIds, usersCollection, {
    disabled: !otherIds.length
  });

  const othersById = useMemo(() => {
    const map = new Map<string, User>();
    others?.forEach((other) => map.set(other.id, other));
    return map;
  }, [others]);

  const visible = (conversations ?? []).filter((c) => c.lastMessage);

  return (
    <MainContainer>
      <SEO title='Messages / The Alternative' />
      <MainHeader useMobileSidebar title='Messages' />
      <section>
        {loading && !conversations ? (
          <Loading className='mt-5' />
        ) : !visible.length ? (
          <StatsEmpty
            title='No messages yet'
            description='Open someone’s profile and press the envelope button to send them a message.'
          />
        ) : (
          visible.map((conversation) => (
            <ConversationRow
              conversation={conversation}
              other={othersById.get(otherParticipant(conversation, userId ?? '')) ?? null}
              me={userId ?? ''}
              key={conversation.id}
            />
          ))
        )}
      </section>
    </MainContainer>
  );
}

Messages.getLayout = (page: ReactElement): ReactNode => (
  <ProtectedLayout>
    <MainLayout>
      <HomeLayout>{page}</HomeLayout>
    </MainLayout>
  </ProtectedLayout>
);
