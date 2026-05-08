export function LoginFooter(): JSX.Element {
  return (
    <footer className='hidden flex-col items-center gap-3 p-4 text-center text-sm text-light-secondary dark:text-dark-secondary lg:flex'>
      <p>© 2026 Saint Michael Web Services Limited</p>
      <p>
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
