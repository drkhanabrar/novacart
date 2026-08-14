import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Falls back to Resend's shared test sender if EMAIL_FROM isn't set.
// Replace with an address on a domain you've verified in Resend
// before going live (onboarding@resend.dev only delivers to your
// own Resend account email while unverified).
const FROM_ADDRESS = process.env.EMAIL_FROM || "NovaCart <onboarding@resend.dev>";

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  if (!resend) {
    // No RESEND_API_KEY configured — log instead of sending, so local
    // dev without an API key doesn't hard-fail.
    console.warn(
      `[email] RESEND_API_KEY not set. Would have sent password reset link to ${to}: ${resetUrl}`
    );
    return { skipped: true as const };
  }

  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject: "Reset your NovaCart password",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #111;">Reset your password</h2>
        <p style="color: #444; line-height: 1.5;">
          We received a request to reset the password for your NovaCart account.
          This link expires in 1 hour.
        </p>
        <p style="margin: 24px 0;">
          <a href="${resetUrl}"
             style="background: #6366f1; color: #fff; padding: 12px 24px;
                    border-radius: 8px; text-decoration: none; font-weight: bold;">
            Reset Password
          </a>
        </p>
        <p style="color: #888; font-size: 13px; line-height: 1.5;">
          If you didn't request this, you can safely ignore this email —
          your password will stay the same.
        </p>
        <p style="color: #888; font-size: 12px; word-break: break-all;">
          Or copy this link: ${resetUrl}
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("[email] Failed to send password reset email:", error);
    throw new Error("Failed to send password reset email.");
  }

  return { skipped: false as const, id: data?.id };
}
