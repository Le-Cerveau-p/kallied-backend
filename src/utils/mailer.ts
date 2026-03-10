import nodemailer from 'nodemailer';

const getTransporter = () => {
  const host = process.env.MAIL_HOST;
  const port = Number(process.env.MAIL_PORT);
  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_PASS;

  if (!host || !port || !user || !pass) {
    throw new Error('Mail configuration is incomplete');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: true,
    auth: { user, pass },
  });
};

/**
 * SEND OTP EMAIL
 */
export const sendOtpEmail = async (params: {
  otp: string;
  purpose: string;
  expiresAt: Date;
  requestedBy: string;
  to: string;
}) => {
  const transporter = getTransporter();

  const from = process.env.MAIL_FROM_OTP!;
  const expiresAtGmt = params.expiresAt.toUTCString();

  await transporter.sendMail({
    from: `K-Allied Security <${from}>`,
    to: params.to,
    subject: `Your OTP Code`,
    text: `
OTP: ${params.otp}

Purpose: ${params.purpose}
Requested By: ${params.requestedBy}
Expires At (GMT): ${expiresAtGmt}
    `,
  });

  return { to: params.to };
};

/**
 * SEND CONTACT EMAIL
 */
export const sendContactEmail = async (params: {
  name: string;
  email: string;
  subject: string;
  message: string;
}) => {
  const transporter = getTransporter();

  const from = process.env.MAIL_FROM_CONTACT!;
  const to = process.env.MAIL_FROM_CONTACT!;

  await transporter.sendMail({
    from: `K-Allied Website <${from}>`,
    to,
    replyTo: params.email,
    subject: `[Website Contact] ${params.subject}`,
    text: `
Name: ${params.name}
Email: ${params.email}

${params.message}
    `,
  });

  return { to };
};
