import nodemailer from "nodemailer";

// Reuse across dev HMR reloads, same reasoning as lib/db/index.ts.
const globalForMailer = globalThis as unknown as {
  transporter?: nodemailer.Transporter;
};

export const transporter =
  globalForMailer.transporter ??
  nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false,
  });
if (process.env.NODE_ENV !== "production") globalForMailer.transporter = transporter;
