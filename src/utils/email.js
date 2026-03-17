import dns from 'dns/promises';
import net from 'net';
import nodemailer from 'nodemailer';

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
};

const parseAddressFamily = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const normalized = Number(String(value).trim());
  return normalized === 4 || normalized === 6 ? normalized : null;
};

const resolveConnectHost = async (host, addressFamily) => {
  const normalizedHost = String(host || '').trim();

  if (!normalizedHost || !addressFamily || net.isIP(normalizedHost)) {
    return normalizedHost;
  }

  try {
    const addresses =
      addressFamily === 6
        ? await dns.resolve6(normalizedHost)
        : await dns.resolve4(normalizedHost);

    if (Array.isArray(addresses) && addresses.length) {
      return addresses[0];
    }
  } catch {}

  return normalizedHost;
};

const buildTransport = async () => {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    SMTP_CONNECT_HOST,
    SMTP_ADDRESS_FAMILY,
    SMTP_TLS_SERVERNAME,
    SMTP_SECURE,
    SMTP_PASS_STRIP_SPACES,
  } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    return null;
  }

  const normalizedUser = String(SMTP_USER).trim();
  const shouldStripPasswordSpaces =
    parseBoolean(SMTP_PASS_STRIP_SPACES, /gmail\.com$/i.test(String(SMTP_HOST).trim()));
  const normalizedPass = shouldStripPasswordSpaces
    ? String(SMTP_PASS).replace(/\s+/g, '')
    : String(SMTP_PASS).trim();
  const connectHost = String(SMTP_CONNECT_HOST || SMTP_HOST).trim();
  const addressFamily = parseAddressFamily(SMTP_ADDRESS_FAMILY);
  const resolvedConnectHost = await resolveConnectHost(connectHost, addressFamily);
  const tlsServername = String(SMTP_TLS_SERVERNAME || SMTP_HOST).trim();
  const secure = parseBoolean(SMTP_SECURE, Number(SMTP_PORT) === 465);

  return nodemailer.createTransport({
    host: resolvedConnectHost,
    port: Number(SMTP_PORT),
    secure,
    auth: {
      user: normalizedUser,
      pass: normalizedPass,
    },
    tls: {
      servername: tlsServername,
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
  });
};

const resolveSender = () => {
  const smtpUser = String(process.env.SMTP_USER || '').trim();
  const emailFrom = String(process.env.EMAIL_FROM || '').trim();

  if (!smtpUser && !emailFrom) {
    return {
      from: 'no-reply@nilaloutfits.com',
    };
  }

  if (!emailFrom || !smtpUser || emailFrom.toLowerCase() === smtpUser.toLowerCase()) {
    return {
      from: emailFrom || smtpUser,
    };
  }

  return {
    from: smtpUser,
    replyTo: emailFrom,
  };
};

export const sendEmail = async ({ to, subject, html, text }) => {
  const transporter = await buildTransport();

  if (!transporter) {
    console.log('Email transport not configured. Email content below:');
    console.log('To:', to);
    console.log('Subject:', subject);
    console.log('Text:', text || '');
    return;
  }

  const sender = resolveSender();

  await transporter.sendMail({
    ...sender,
    to,
    subject,
    text,
    html,
  });
};
