import nodemailer from 'nodemailer';

export class EmailService {
  static getTransporter() {
    const pass = process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/\s+/g, '') : undefined;

    // If explicit service like 'gmail' is set
    if (process.env.SMTP_SERVICE && process.env.SMTP_USER && pass) {
      return nodemailer.createTransport({
        service: process.env.SMTP_SERVICE,
        auth: {
          user: process.env.SMTP_USER,
          pass,
        },
      });
    }

    // Standard SMTP Host/Port
    if (
      process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      pass
    ) {
      return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_PORT === '465' || process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass,
        },
      });
    }
    return null;
  }

  static async sendOtpEmail({ email, otp }) {
    console.log(`\n========================================`);
    console.log(`📧 [EMAIL OTP DISPATCH] -> To: ${email}`);
    console.log(`⏰ Valid for: 5 minutes`);
    console.log(`========================================\n`);

    const transporter = this.getTransporter();

    if (!transporter) {
      console.error('SMTP Error: Email credentials (SMTP_USER / SMTP_PASS) not configured on this server.');
      return { sent: false, error: 'Email service is not configured on the server. Please set SMTP credentials.' };
    }

    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || `"FinTrack AI" <${process.env.SMTP_USER}>`,
        to: email,
        subject: `${otp} is your FinTrack verification code`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #0F172A;">FinTrack Security Verification</h2>
            <p>Use the following 6-digit one-time password (OTP) to securely access your FinTrack account:</p>
            <div style="background-color: #f1f5f9; padding: 15px; text-align: center; border-radius: 6px; margin: 20px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #4F46E5;">${otp}</span>
            </div>
            <p style="color: #64748b; font-size: 13px;">This code will expire in 5 minutes. If you did not request this, please ignore this email.</p>
          </div>
        `,
      });
      return { sent: true };
    } catch (err) {
      console.error('SMTP Delivery error:', err.message);
      return { sent: false, error: err.message };
    }
  }
}
