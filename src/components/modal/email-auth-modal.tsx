import { useState } from 'react';
import { Dialog } from '@headlessui/react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '@lib/context/auth-context';
import { Button } from '@components/ui/button';
import { backdrop, modal } from './modal';

type Mode = 'signup' | 'signin';

type EmailAuthModalProps = {
  open: boolean;
  initialMode?: Mode;
  closeModal: () => void;
};

export function EmailAuthModal({
  open,
  initialMode = 'signup',
  closeModal
}: EmailAuthModalProps): JSX.Element {
  const { signUpWithEmail, signInWithEmail } = useAuth();

  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const isSignup = mode === 'signup';

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);
    try {
      if (isSignup) {
        await signUpWithEmail(name.trim(), email.trim(), password);
      } else {
        await signInWithEmail(email.trim(), password);
      }
      closeModal();
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? '';
      if (code === 'auth/email-already-in-use')
        setErrorMsg('An account with this email already exists.');
      else if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found')
        setErrorMsg('Invalid email or password.');
      else if (code === 'auth/weak-password')
        setErrorMsg('Password must be at least 6 characters.');
      else if (code === 'auth/invalid-email')
        setErrorMsg('Please enter a valid email address.');
      else
        setErrorMsg('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (): void => {
    setMode(isSignup ? 'signin' : 'signup');
    setErrorMsg('');
  };

  return (
    <AnimatePresence>
      {open && (
        <Dialog
          className='relative z-50'
          open={open}
          onClose={closeModal}
          static
        >
          <motion.div
            className='hover-animation fixed inset-0 bg-black/40 dark:bg-[#5B7083]/40'
            aria-hidden='true'
            {...backdrop}
          />
          <div className='fixed inset-0 flex items-center justify-center p-4'>
            <Dialog.Panel
              as={motion.div}
              {...modal}
              className='w-full max-w-sm rounded-2xl bg-main-background p-8 shadow-xl'
            >
              <Dialog.Title className='mb-6 text-xl font-bold text-light-primary dark:text-dark-primary'>
                {isSignup ? 'Create your account' : 'Sign in to your account'}
              </Dialog.Title>

              <form onSubmit={handleSubmit} className='flex flex-col gap-4'>
                {isSignup && (
                  <div className='flex flex-col gap-1'>
                    <label
                      htmlFor='name'
                      className='text-sm font-medium text-light-secondary dark:text-dark-secondary'
                    >
                      Name
                    </label>
                    <input
                      id='name'
                      type='text'
                      required
                      autoComplete='name'
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className='rounded-md border border-light-border bg-inherit px-3 py-2 text-light-primary
                                 outline-none focus:border-accent-blue dark:border-dark-border dark:text-dark-primary'
                    />
                  </div>
                )}

                <div className='flex flex-col gap-1'>
                  <label
                    htmlFor='email'
                    className='text-sm font-medium text-light-secondary dark:text-dark-secondary'
                  >
                    Email
                  </label>
                  <input
                    id='email'
                    type='email'
                    required
                    autoComplete='email'
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className='rounded-md border border-light-border bg-inherit px-3 py-2 text-light-primary
                               outline-none focus:border-accent-blue dark:border-dark-border dark:text-dark-primary'
                  />
                </div>

                <div className='flex flex-col gap-1'>
                  <label
                    htmlFor='password'
                    className='text-sm font-medium text-light-secondary dark:text-dark-secondary'
                  >
                    Password
                  </label>
                  <input
                    id='password'
                    type='password'
                    required
                    minLength={6}
                    autoComplete={isSignup ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className='rounded-md border border-light-border bg-inherit px-3 py-2 text-light-primary
                               outline-none focus:border-accent-blue dark:border-dark-border dark:text-dark-primary'
                  />
                </div>

                {errorMsg && (
                  <p className='text-sm text-red-500'>{errorMsg}</p>
                )}

                <Button
                  type='submit'
                  loading={loading}
                  className='mt-2 bg-accent-blue font-bold text-white transition hover:brightness-90
                             focus-visible:!ring-accent-blue/80 focus-visible:brightness-90 active:brightness-75'
                >
                  {isSignup ? 'Sign up' : 'Sign in'}
                </Button>
              </form>

              <p className='mt-4 text-center text-sm text-light-secondary dark:text-dark-secondary'>
                {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
                <button
                  type='button'
                  onClick={switchMode}
                  className='font-bold text-accent-blue hover:underline'
                >
                  {isSignup ? 'Sign in' : 'Sign up'}
                </button>
              </p>

              <button
                type='button'
                onClick={closeModal}
                className='absolute right-4 top-4 text-light-secondary hover:text-light-primary dark:text-dark-secondary dark:hover:text-dark-primary'
                aria-label='Close'
              >
                ✕
              </button>
            </Dialog.Panel>
          </div>
        </Dialog>
      )}
    </AnimatePresence>
  );
}
