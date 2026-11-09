import nodemailer from "nodemailer";
export async function sendPasswordReset(email: string, url: string) {
  if (!process.env.SMTP_HOST || !process.env.MAIL_FROM)
    throw new Error(
      "El servicio de correo no está configurado. Contacta a AgenciaLabs.",
    );
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_PORT === "465",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });
  await transport.sendMail({
    from: process.env.MAIL_FROM,
    to: email,
    subject: "Restablece tu contraseña de AgenciaLabs",
    text: `Recibimos una solicitud para restablecer tu contraseña.\n\nAbre este enlace para elegir una nueva:\n${url}\n\nSi no lo solicitaste, puedes ignorar este correo.\nAgenciaLabs`,
  });
}
