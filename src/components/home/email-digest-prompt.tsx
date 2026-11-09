import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useAuth } from '@lib/context/auth-context';
import { updateEmailDigest } from '@lib/firebase/utils';
import { HeroIcon } from '@components/ui/hero-icon';
import type { EmailDigestFrequency } from '@lib/types/user';

/**
 * Asks signed-in users who have never chosen an email round-up frequency
 * whether they want one. The digest stays opt-in (see api/digest/run.ts):
 * nothing is sent unless the user picks Daily or Weekly here or in
 * Notifications. "No thanks" stores 'off' so the prompt does not return.
 */
export function EmailDigestPrompt(): JSX.Element | null {
  const { user } = useAuth();
  const [hidden, setHidden] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!user || hidden || user.emailDigest !== undefined) return null;

  const choose = async (frequency: EmailDigestFrequency): Promise<void> => {
    if (saving) return;
    setSaving(true);

    try {
      await updateEmailDigest(user.id, frequency);
      setHidden(true);
      if (frequency !== 'off')
        toast.success(`You’ll get a ${frequency} round-up of new posts`);
    } catch {
      toast.error('Could not save your preference');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className='flex flex-wrap items-center justify-between gap-3 border-b
                 border-light-border px-4 py-3 dark:border-dark-border'
    >
      <div className='flex items-center gap-3'>
        <i className='text-main-accent'>
          <HeroIcon className='h-5 w-5' iconName='EnvelopeIcon' />
        </i>
        <div>
          <p className='font-bold'>Get new posts by email?</p>
          <p className='text-sm text-light-secondary dark:text-dark-secondary'>
            A short round-up of new posts. You can change this anytime in
            Notifications.
          </p>
        </div>
      </div>
      <div className='flex gap-2'>
        <button
          type='button'
          disabled={saving}
          className='rounded-full bg-main-accent px-4 py-1.5 text-sm font-bold
                     text-white disabled:cursor-wait'
          onClick={(): void => void choose('daily')}
        >
          Daily
        </button>
        <button
          type='button'
          disabled={saving}
          className='rounded-full bg-main-accent px-4 py-1.5 text-sm font-bold
                     text-white disabled:cursor-wait'
          onClick={(): void => void choose('weekly')}
        >
          Weekly
        </button>
        <button
          type='button'
          disabled={saving}
          className='rounded-full border border-light-border px-4 py-1.5 text-sm
                     font-medium disabled:cursor-wait dark:border-dark-border'
          onClick={(): void => void choose('off')}
        >
          No thanks
        </button>
      </div>
    </div>
  );
}
