export function LoginFooter(): JSX.Element {
  return (
    <footer className='flex flex-col items-center gap-3 p-4 text-center text-sm text-light-secondary dark:text-dark-secondary'>
      <p>
        Made by{' '}
        <a
          href='https://www.saintmichaelwebservices.com'
          target='_blank'
          rel='noopener noreferrer'
          className='text-accent-blue hover:underline'
        >
          Saint Michael Web Services Limited
        </a>
      </p>
      <p className='hidden lg:block'>© 2026 Saint Michael Web Services Limited</p>
      <p className='hidden lg:block'>
        Want a social network like this for £15/month?{' '}
        <a
          href='https://wa.me/447561622086'
          target='_blank'
          rel='noopener noreferrer'
          className='text-accent-blue hover:underline'
        >
          Contact us on WhatsApp
        </a>
      </p>
    </footer>
  );
}
