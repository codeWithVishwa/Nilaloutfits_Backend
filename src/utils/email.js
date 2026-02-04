import nodemailer from 'nodemailer';

const buildTransport = () => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
};

export const sendEmail = async ({ to, subject, html, text }) => {
  const transporter = buildTransport();

  if (!transporter) {
    console.log('Email transport not configured. Email content below:');
    console.log('To:', to);
    console.log('Subject:', subject);
    console.log('Text:', text || '');
    return;
  }

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'no-reply@nilaloutfits.com',
    to,
    subject,
    text,
    html,
  });
};
