import { useState } from 'react';
import cn from 'clsx';
import { toast } from 'react-hot-toast';
import { updateEmailDigest } from '@lib/firebase/utils';
import { HeroIcon } from '@components/ui/hero-icon';
import type { EmailDigestFrequency } from '@lib/types/user';

type EmailDigestSettingsProps = {
  userId: string;
  current: EmailDigestFrequency;
};

const options: { value: EmailDigestFrequency; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' }
];

export function EmailDigestSettings({
  userId,
  current
}: EmailDigestSettingsProps): JSX.Element {
  const [frequency, setFrequency] = useState<EmailDigestFrequency>(current);
  const [saving, setSaving] = useState(false);

  const handleChange = async (next: EmailDigestFrequency): Promise<void> => {
    if (next === frequency || saving) return;

    const previous = frequency;

    setFrequency(next);
    setSaving(true);

    try {
      await updateEmailDigest(userId, next);
      toast.success(
        next === 'off'
          ? 'Email round-ups turned off'
          : `You’ll get a ${next} round-up of new posts`
      );
    } catch {
      setFrequency(previous);
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
          <p className='font-bold'>Email round-up</p>
          <p className='text-sm text-light-secondary dark:text-dark-secondary'>
            A summary of new posts, sent to your account email.
          </p>
        </div>
      </div>
      <div
        className='flex overflow-hidden rounded-full border border-light-border
                   dark:border-dark-border'
        role='group'
        aria-label='Email round-up frequency'
      >
        {options.map(({ value, label }) => (
          <button
            type='button'
            key={value}
            disabled={saving}
            aria-pressed={frequency === value}
            className={cn(
              'px-4 py-1.5 text-sm font-medium transition disabled:cursor-wait',
              frequency === value
                ? 'bg-main-accent text-white'
                : 'hover:bg-light-primary/10 dark:hover:bg-dark-primary/10'
            )}
            onClick={(): void => void handleChange(value)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
