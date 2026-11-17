import { useEffect, useState } from 'react';
import cn from 'clsx';
import { toast } from 'react-hot-toast';
import {
  updateEmailDigest,
  updateEmailActivity,
  getContactEmail,
  saveContactEmail
} from '@lib/firebase/utils';
import { auth } from '@lib/firebase/app';
import { HeroIcon } from '@components/ui/hero-icon';
import type { EmailDigestFrequency, EmailActivitySetting } from '@lib/types/user';

type EmailSettingsProps = {
  userId: string;
  digest: EmailDigestFrequency;
  activity: EmailActivitySetting;
};

type Option<T> = { value: T; label: string };

function Segmented<T extends string>({
  label,
  options,
  value,
  disabled,
  onChange
}: {
  label: string;
  options: Option<T>[];
  value: T;
  disabled: boolean;
  onChange: (next: T) => void;
}): JSX.Element {
  return (
    <div
      className='flex overflow-hidden rounded-full border border-light-border dark:border-dark-border'
      role='group'
      aria-label={label}
    >
      {options.map((option) => (
        <button
          type='button'
          key={option.value}
          disabled={disabled}
          aria-pressed={value === option.value}
          className={cn(
            'px-4 py-1.5 text-sm font-medium transition disabled:cursor-wait',
            value === option.value
              ? 'bg-main-accent text-white'
              : 'hover:bg-light-primary/10 dark:hover:bg-dark-primary/10'
          )}
          onClick={(): void => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Shown only when the signed-in account has no email address on record, so
 * the round-up and activity emails have somewhere to go.
 */
function MissingEmail({ userId, row }: { userId: string; row: string }): JSX.Element | null {
  const [needed, setNeeded] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const current = auth.currentUser;
    if (!current || current.uid !== userId) return;
    if (current.email || current.providerData.some((p) => p.email)) return;

    let cancelled = false;
    getContactEmail(userId)
      .then((saved) => {
        if (!cancelled && !saved) setNeeded(true);
      })
      .catch(() => undefined);
    return (): void => {
      cancelled = true;
    };
  }, [userId]);

  if (!needed) return null;

  const submit = async (): Promise<void> => {
    const email = value.trim();
    if (!EMAIL_PATTERN.test(email)) {
      toast.error('Enter a valid email address');
      return;
    }
    setSaving(true);
    try {
      await saveContactEmail(userId, email);
      toast.success('Email saved. Your emails will go there.');
      setNeeded(false);
    } catch {
      toast.error('Could not save your email');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className={row}
      onSubmit={(e): void => {
        e.preventDefault();
        void submit();
      }}
    >
      <div>
        <p className='font-bold'>Where should we send these?</p>
        <p className='text-sm text-light-secondary dark:text-dark-secondary'>
          Your account has no email address, so we can’t send you emails yet. Only you can see it.
        </p>
      </div>
      <div className='flex gap-2'>
        <input
          type='email'
          required
          value={value}
          onChange={(e): void => setValue(e.target.value)}
          placeholder='you@example.com'
          aria-label='Email address for notifications'
          className='rounded-full border border-light-border bg-transparent px-4 py-1.5 text-sm dark:border-dark-border'
        />
        <button
          type='submit'
          disabled={saving}
          className='rounded-full bg-main-accent px-4 py-1.5 text-sm font-medium text-white disabled:cursor-wait'
        >
          Save
        </button>
      </div>
    </form>
  );
}

export function EmailSettings({ userId, digest, activity }: EmailSettingsProps): JSX.Element {
  const [digestValue, setDigestValue] = useState<EmailDigestFrequency>(digest);
  const [activityValue, setActivityValue] = useState<EmailActivitySetting>(activity);
  const [saving, setSaving] = useState(false);

  const save = async (work: () => Promise<void>, undo: () => void, message: string): Promise<void> => {
    setSaving(true);
    try {
      await work();
      toast.success(message);
    } catch {
      undo();
      toast.error('Could not save your preference');
    } finally {
      setSaving(false);
    }
  };

  const changeActivity = (next: EmailActivitySetting): void => {
    if (next === activityValue || saving) return;
    const previous = activityValue;
    setActivityValue(next);
    void save(
      () => updateEmailActivity(userId, next),
      () => setActivityValue(previous),
      next === 'on' ? 'We’ll email you about new followers, replies, likes and messages' : 'Activity emails turned off'
    );
  };

  const changeDigest = (next: EmailDigestFrequency): void => {
    if (next === digestValue || saving) return;
    const previous = digestValue;
    setDigestValue(next);
    void save(
      () => updateEmailDigest(userId, next),
      () => setDigestValue(previous),
      next === 'off' ? 'Round-ups turned off' : `You’ll get a ${next} round-up of new posts and members`
    );
  };

  const row = 'flex flex-wrap items-center justify-between gap-3 px-4 py-3';

  return (
    <div className='border-b border-light-border dark:border-dark-border'>
      <MissingEmail userId={userId} row={row} />
      <div className={row}>
        <div className='flex items-center gap-3'>
          <i className='text-main-accent'>
            <HeroIcon className='h-5 w-5' iconName='BellIcon' />
          </i>
          <div>
            <p className='font-bold'>Activity emails</p>
            <p className='text-sm text-light-secondary dark:text-dark-secondary'>
              New followers, replies, likes and unread messages. At most one email an hour.
            </p>
          </div>
        </div>
        <Segmented
          label='Activity emails'
          options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]}
          value={activityValue}
          disabled={saving}
          onChange={changeActivity}
        />
      </div>
      <div className={row}>
        <div className='flex items-center gap-3'>
          <i className='text-main-accent'>
            <HeroIcon className='h-5 w-5' iconName='EnvelopeIcon' />
          </i>
          <div>
            <p className='font-bold'>Round-up</p>
            <p className='text-sm text-light-secondary dark:text-dark-secondary'>
              New posts and new members on The Alternative.
            </p>
          </div>
        </div>
        <Segmented
          label='Round-up frequency'
          options={[
            { value: 'off', label: 'Off' },
            { value: 'daily', label: 'Daily' },
            { value: 'weekly', label: 'Weekly' }
          ]}
          value={digestValue}
          disabled={saving}
          onChange={changeDigest}
        />
      </div>
    </div>
  );
}
