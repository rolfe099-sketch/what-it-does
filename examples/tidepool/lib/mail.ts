import { Resend } from 'resend';

export const resend = new Resend(process.env.RESEND_API_KEY!);

export async function sendMail(to: string, subject: string, body: string) {
  return resend.emails.send({
    from: 'Tidepool <hello@tidepool.example>',
    to,
    subject,
    text: body,
  });
}
