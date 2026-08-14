'use server';

import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sendPasswordResetEmail } from "@/lib/email";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function registerUser(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const name = formData.get("name") as string;

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return { error: "An account with this email already exists." };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
    },
  });

  return { success: true, userId: user.id };
}

export async function loginUser(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return { error: "Invalid email or password." };
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return { error: "Invalid email or password." };
  }

  return { success: true, userId: user.id, name: user.name };
}

/**
 * Step 1 of password reset: user submits their email.
 * Generates a one-time token valid for 1 hour, stores its hash, and
 * emails the reset link via Resend (see src/lib/email.ts).
 *
 * Always returns the same generic success message regardless of
 * whether the email exists, so the form can't be used to check
 * which emails are registered.
 */
type RequestResetResult =
  | { error: string; success?: undefined; message?: undefined }
  | { success: true; message: string; error?: undefined };

export async function requestPasswordReset(formData: FormData): Promise<RequestResetResult> {
  const email = formData.get("email") as string;

  if (!email) {
    return { error: "Email is required." };
  }

  const user = await prisma.user.findUnique({ where: { email } });

  // Always return a generic success message, whether or not the
  // account exists — this avoids leaking which emails are registered.
  const genericSuccess = {
    success: true as const,
    message: "If an account exists for that email, a reset link has been sent to it.",
  };

  if (!user) {
    return genericSuccess;
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const resetTokenHash = hashToken(rawToken);
  const resetTokenExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await prisma.user.update({
    where: { id: user.id },
    data: { resetTokenHash, resetTokenExpiresAt },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const resetUrl = `${baseUrl}/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`;

  try {
    await sendPasswordResetEmail(email, resetUrl);
  } catch {
    return { error: "Something went wrong sending the reset email. Please try again shortly." };
  }

  return genericSuccess;
}

/**
 * Step 2 of password reset: user submits the token (from the emailed
 * link) along with a new password.
 */
export async function resetPassword(formData: FormData) {
  const email = formData.get("email") as string;
  const token = formData.get("token") as string;
  const password = formData.get("password") as string;

  if (!email || !token || !password) {
    return { error: "All fields are required." };
  }

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (
    !user ||
    !user.resetTokenHash ||
    !user.resetTokenExpiresAt ||
    user.resetTokenExpiresAt < new Date()
  ) {
    return { error: "This reset link is invalid or has expired." };
  }

  const providedTokenHash = hashToken(token);
  if (providedTokenHash !== user.resetTokenHash) {
    return { error: "This reset link is invalid or has expired." };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      resetTokenHash: null,
      resetTokenExpiresAt: null,
    },
  });

  return { success: true };
}
