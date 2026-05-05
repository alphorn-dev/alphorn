import nodemailer from "nodemailer";

function getSmtpConfig() {
  return {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM,
  };
}

export function isMailerConfigured(): boolean {
  const { host, port, user, pass, from } = getSmtpConfig();
  return !!(host && port && user && pass && from);
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    if (!isMailerConfigured()) {
      throw new Error("SMTP is not configured");
    }
    const { host, port: portStr, user, pass } = getSmtpConfig();
    const port = Number(portStr);
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });
  }
  return transporter;
}

export async function sendMail(
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  const transport = getTransporter();
  await transport.sendMail({
    from: getSmtpConfig().from,
    to,
    subject,
    html,
  });
}
