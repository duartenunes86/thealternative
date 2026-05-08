export function AsideFooter(): JSX.Element {
  return (
    <footer
      className='sticky top-16 flex flex-col gap-3 text-center text-sm
                 text-light-secondary dark:text-dark-secondary'
    >
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
