import nodemailer from "nodemailer";

// Reuse across dev HMR reloads, same reasoning as lib/db/index.ts.
const globalForMailer = globalThis as unknown as {
  transporter?: nodemailer.Transporter;
};

export function isEmailConfigured() {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_FROM,
  );
}

export const transporter =
  globalForMailer.transporter ??
  nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false,
  });
if (process.env.NODE_ENV !== "production") globalForMailer.transporter = transporter;
