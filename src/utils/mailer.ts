import nodemailer from 'nodemailer';

const DEFAULT_SENDER_EMAIL = 'techcity025@gmail.com';
const DEFAULT_CONTACT_RECEIVER_EMAIL = 'techcity025@gmail.com';

const getSenderEmail = () =>
  process.env.OTP_SENDER_EMAIL ?? DEFAULT_SENDER_EMAIL;

const getContactReceiverEmail = () =>
  process.env.CONTACT_RECEIVER_EMAIL ?? DEFAULT_CONTACT_RECEIVER_EMAIL;

const getTransporter = () => {
  const user = getSenderEmail();
  const pass = process.env.OTP_EMAIL_PASS;

  if (!pass) {
    throw new Error('OTP email not configured: missing OTP_EMAIL_PASS');
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
};

export const sendOtpEmail = async (params: {
  otp: string;
  purpose: string;
  expiresAt: Date;
  requestedBy: string;
  to?: string;
}) => {
  const transporter = getTransporter();
  const to = params.to ?? process.env.OTP_AUTH_EMAIL ?? getSenderEmail();
  const from = getSenderEmail();
  const expiresAt = params.expiresAt.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  await transporter.sendMail({
    from: `K-Allied <${from}>`,
    to,
    subject: `K-Allied OTP (${params.purpose})`,
    text: `OTP: ${params.otp}\nPurpose: ${params.purpose}\nRequested by: ${params.requestedBy}\nExpires at: ${expiresAt}`,
  });

  return { to };
};

export const sendContactEmail = async (params: {
  name: string;
  email: string;
  subject: string;
  message: string;
}) => {
  const transporter = getTransporter();
  const from = getSenderEmail();
  const to = getContactReceiverEmail();

  await transporter.sendMail({
    from: `K-Allied Website <${from}>`,
    to,
    replyTo: params.email,
    subject: `[Website Contact] ${params.subject}`,
    text: [
      `Name: ${params.name}`,
      `Email: ${params.email}`,
      `Subject: ${params.subject}`,
      '',
      params.message,
    ].join('\n'),
  });

  return { to };
};
