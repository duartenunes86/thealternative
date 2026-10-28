import { createTransport } from 'nodemailer';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Transporter } from 'nodemailer';

/**
 * Shared email sending for the round-up and the activity emails.
 * Uses the same settings as before: EMAIL_HOST/EMAIL_PORT/EMAIL_API/EMAIL_API_PASSWORD
 * for SMTP, or Resend's HTTPS API when the password is a Resend key (re_...).
 */
export const siteURL = process.env.NEXT_PUBLIC_URL ?? 'https://thealternative.social';
export const postalAddress = process.env.EMAIL_POSTAL_ADDRESS ?? '';

export type EmailKind = 'digest' | 'activity';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Digest links keep their original format so links in old emails still work. */
export function unsubscribeToken(userId: string, kind: EmailKind): string {
  const input = kind === 'digest' ? userId : `${userId}:${kind}`;
  return createHmac('sha256', process.env.DIGEST_SECRET ?? '').update(input).digest('hex').slice(0, 32);
}

export function unsubscribeUrl(userId: string, kind: EmailKind): string {
  const kindParam = kind === 'digest' ? '' : `&kind=${kind}`;
  return `${siteURL}/api/digest/unsubscribe?uid=${encodeURIComponent(userId)}&token=${unsubscribeToken(userId, kind)}${kindParam}`;
}

export function tokenIsValid(userId: string, kind: EmailKind, token: string): boolean {
  const expected = Buffer.from(unsubscribeToken(userId, kind));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function emailConfigured(): boolean {
  return Boolean(process.env.EMAIL_API && process.env.EMAIL_API_PASSWORD);
}

export type Mail = { to: string; subject: string; html: string; text: string; unsubUrl: string };

export function createMailer(): (mail: Mail) => Promise<void> {
  const user = process.env.EMAIL_API as string;
  const pass = process.env.EMAIL_API_PASSWORD as string;
  const useResendApi = pass.startsWith('re_');
  const host = process.env.EMAIL_HOST;
  const port = Number(process.env.EMAIL_PORT ?? 465);
  const fromName = process.env.EMAIL_FROM_NAME ?? 'The Alternative';
  const fromAddress = process.env.EMAIL_FROM ?? user;
  const from = `${fromName} <${fromAddress}>`;

  let client: Transporter | null = null;
  if (!useResendApi)
    client = createTransport(
      host ? { host, port, secure: port === 465, auth: { user, pass } } : { service: 'Gmail', auth: { user, pass } }
    );

  return async ({ to, subject, html, text, unsubUrl }: Mail): Promise<void> => {
    const headers = {
      'List-Unsubscribe': `<${unsubUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
    };

    if (client) {
      await client.sendMail({ from, to, subject, html, text, headers });
      return;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${pass}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html, text, headers })
    });
    if (!response.ok) throw new Error(`Resend ${response.status}: ${await response.text()}`);
  };
}

/** Same frame as the existing round-up email, so all emails look alike. */
export function emailFrame(intro: string, body: string, footerNote: string, unsubUrl: string, unsubLabel: string): string {
  return `<div style="margin:0;padding:24px;background:#f5f8fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
    <table role="presentation" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:24px" width="100%">
      <tr><td>
        <h1 style="margin:0 0 4px;font-size:20px;color:#14171a">The Alternative</h1>
        <p style="margin:0 0 16px;color:#687684;font-size:14px">${intro}</p>
      </td></tr>
      ${body}
      <tr><td style="padding-top:20px">
        <a href="${siteURL}/home" style="display:inline-block;background:#1da1f2;color:#fff;padding:10px 20px;border-radius:9999px;text-decoration:none;font-weight:600">Open The Alternative</a>
      </td></tr>
      <tr><td style="padding-top:24px;color:#687684;font-size:12px;line-height:1.5">
        ${footerNote}<br>
        <a href="${unsubUrl}" style="color:#687684">${unsubLabel}</a>
        ${postalAddress ? `<br><br>${escapeHtml(postalAddress)}` : ''}
      </td></tr>
    </table></div>`;
}

/** Checks the shared secret used by the scheduler. */
export function schedulerAuthorized(header: string | string[] | undefined, querySecret: unknown): boolean {
  const secret = process.env.DIGEST_SECRET;
  const provided = (typeof header === 'string' ? header : undefined) ?? (typeof querySecret === 'string' ? querySecret : undefined);
  if (!secret || !provided) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}
