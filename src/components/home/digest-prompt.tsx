import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useAuth } from '@lib/context/auth-context';
import { updateEmailDigest } from '@lib/firebase/utils';
import { Button } from '@components/ui/button';
import { HeroIcon } from '@components/ui/hero-icon';
import type { EmailDigestFrequency } from '@lib/types/user';

/**
 * Asks once whether the person wants the email round-up. Round-ups are
 * promotional, so UK rules (PECR) need a clear yes; nobody gets one until
 * they answer here or turn it on in Notifications.
 */
export function DigestPrompt(): JSX.Element | null {
  const { user } = useAuth();
  const [hidden, setHidden] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!user || hidden || user.emailDigest !== undefined) return null;

  const answer = async (choice: EmailDigestFrequency): Promise<void> => {
    setSaving(true);
    try {
      await updateEmailDigest(user.id, choice);
      setHidden(true);
      if (choice !== 'off')
        toast.success(`Done. You’ll get a ${choice} round-up by email.`);
    } catch {
      toast.error('Could not save your answer');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className='mx-4 my-3 flex flex-col gap-3 rounded-2xl border border-light-border p-4
                 dark:border-dark-border'
      aria-labelledby='digest-prompt-title'
    >
      <div className='flex items-start gap-3'>
        <i className='mt-0.5 text-main-accent'>
          <HeroIcon className='h-6 w-6' iconName='EnvelopeIcon' />
        </i>
        <div>
          <h2 id='digest-prompt-title' className='font-bold'>
            Get a round-up by email?
          </h2>
          <p className='text-sm text-light-secondary dark:text-dark-secondary'>
            New posts and new members, in one short email. You can change this any time in Notifications.
          </p>
        </div>
      </div>
      <div className='flex flex-wrap gap-2'>
        <Button
          className='accent-tab bg-main-accent px-4 py-1.5 text-sm font-bold text-white hover:brightness-90'
          disabled={saving}
          onClick={(): void => void answer('weekly')}
        >
          Yes, weekly
        </Button>
        <Button
          className='border border-light-border px-4 py-1.5 text-sm font-bold hover:bg-light-primary/10
                     dark:border-dark-border dark:hover:bg-dark-primary/10'
          disabled={saving}
          onClick={(): void => void answer('daily')}
        >
          Daily
        </Button>
        <Button
          className='px-4 py-1.5 text-sm font-medium text-light-secondary hover:bg-light-primary/10
                     dark:text-dark-secondary dark:hover:bg-dark-primary/10'
          disabled={saving}
          onClick={(): void => void answer('off')}
        >
          No thanks
        </Button>
      </div>
    </section>
  );
}
