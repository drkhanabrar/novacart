"use server";
import { prisma } from "@/lib/prisma";
import { createSession, destroySession, requireUser } from "@/lib/auth";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sendPasswordResetEmail } from "@/lib/email";
import { revalidatePath } from "next/cache";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
const emailOf = (v: FormDataEntryValue | null) => String(v || "").trim().toLowerCase();
const validPhone = (v: string) => !v || /^[+0-9()\-\s]{7,20}$/.test(v);

function registrationAddress(formData: FormData) {
  return {
    label: String(formData.get("addressLabel") || "Home").trim() || "Home",
    fullName: String(formData.get("addressFullName") || "").trim(),
    phone: String(formData.get("addressPhone") || "").trim(),
    line1: String(formData.get("addressLine1") || "").trim(),
    line2: String(formData.get("addressLine2") || "").trim() || null,
    city: String(formData.get("addressCity") || "").trim(),
    state: String(formData.get("addressState") || "").trim(),
    postalCode: String(formData.get("addressPostalCode") || "").trim(),
    country: String(formData.get("addressCountry") || "India").trim() || "India",
  };
}
function validateAddress(a: ReturnType<typeof registrationAddress>) {
  if (!a.fullName || !a.phone || !a.line1 || !a.city || !a.state || !a.postalCode) return "Please complete all required delivery address fields.";
  if (!/^[+0-9()\-\s]{7,20}$/.test(a.phone)) return "Please enter a valid delivery phone number.";
  if (!/^[A-Za-z0-9\-\s]{3,10}$/.test(a.postalCode)) return "Please enter a valid postal code.";
  return null;
}

export async function registerUser(formData: FormData) {
  const email = emailOf(formData.get("email"));
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");
  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  if (!name || !email || !password) return { error: "Full name, email and password are required." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password !== confirmPassword) return { error: "Passwords do not match." };
  if (!validPhone(phone)) return { error: "Please enter a valid mobile number." };
  if (formData.get("terms") !== "on") return { error: "Please accept the terms and privacy policy to continue." };
  const address = registrationAddress(formData);
  const addressError = validateAddress(address);
  if (addressError) return { error: addressError };
  if (await prisma.user.findUnique({ where: { email } })) return { error: "An account with this email already exists." };
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({ data: { email, passwordHash, name, phone: phone || null } });
    await tx.userAddress.create({ data: { userId: created.id, ...address, isDefault: true } });
    return created;
  });
  await createSession(user.id);
  return { success: true as const };
}

export async function loginUser(formData: FormData) {
  const email = emailOf(formData.get("email"));
  const password = String(formData.get("password") || "");
  if (!email || !password) return { error: "Email and password are required." };
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return { error: "Invalid email or password." };
  await createSession(user.id);
  return { success: true as const };
}
export async function logoutUser() { await destroySession(); revalidatePath("/", "layout"); return { success: true as const }; }
export async function updateProfile(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  if (!name) return { error: "Full name is required." };
  if (!validPhone(phone)) return { error: "Please enter a valid mobile number." };
  await prisma.user.update({ where: { id: user.id }, data: { name, phone: phone || null } });
  revalidatePath("/account"); revalidatePath("/", "layout");
  return { success: true as const };
}
function savedAddressData(formData: FormData) {
  return {
    label: String(formData.get("label") || "Home").trim() || "Home",
    fullName: String(formData.get("fullName") || "").trim(),
    phone: String(formData.get("phone") || "").trim(),
    line1: String(formData.get("line1") || "").trim(),
    line2: String(formData.get("line2") || "").trim() || null,
    city: String(formData.get("city") || "").trim(),
    state: String(formData.get("state") || "").trim(),
    postalCode: String(formData.get("postalCode") || "").trim(),
    country: String(formData.get("country") || "India").trim() || "India",
  };
}
function validateSavedAddress(a: ReturnType<typeof savedAddressData>) {
  if (!a.fullName || !a.phone || !a.line1 || !a.city || !a.state || !a.postalCode) return "Please complete all required address fields.";
  if (!/^[+0-9()\-\s]{7,20}$/.test(a.phone)) return "Please enter a valid phone number.";
  if (!/^[A-Za-z0-9\-\s]{3,10}$/.test(a.postalCode)) return "Please enter a valid postal code.";
  return null;
}
export async function createAddress(formData: FormData) {
  const user = await requireUser(); const data = savedAddressData(formData); const error = validateSavedAddress(data); if (error) return { error };
  const makeDefault = formData.get("isDefault") === "on"; const count = await prisma.userAddress.count({ where: { userId: user.id } });
  await prisma.$transaction(async tx => { if (makeDefault || count === 0) await tx.userAddress.updateMany({ where: { userId: user.id }, data: { isDefault: false } }); await tx.userAddress.create({ data: { ...data, userId: user.id, isDefault: makeDefault || count === 0 } }); });
  revalidatePath("/account"); revalidatePath("/checkout"); return { success: true as const };
}
export async function updateAddress(formData: FormData) {
  const user = await requireUser(); const id = String(formData.get("id") || ""); const data = savedAddressData(formData); const error = validateSavedAddress(data); if (!id) return { error: "Address not found." }; if (error) return { error };
  const address = await prisma.userAddress.findFirst({ where: { id, userId: user.id } }); if (!address) return { error: "Address not found." };
  const makeDefault = formData.get("isDefault") === "on";
  await prisma.$transaction(async tx => { if (makeDefault) await tx.userAddress.updateMany({ where: { userId: user.id }, data: { isDefault: false } }); await tx.userAddress.update({ where: { id }, data: { ...data, isDefault: makeDefault || address.isDefault } }); });
  revalidatePath("/account"); revalidatePath("/checkout"); return { success: true as const };
}
export async function deleteAddress(formData: FormData) {
  const user = await requireUser(); const id = String(formData.get("id") || ""); const address = await prisma.userAddress.findFirst({ where: { id, userId: user.id } }); if (!address) return { error: "Address not found." };
  await prisma.userAddress.delete({ where: { id } });
  if (address.isDefault) { const next = await prisma.userAddress.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }); if (next) await prisma.userAddress.update({ where: { id: next.id }, data: { isDefault: true } }); }
  revalidatePath("/account"); revalidatePath("/checkout"); return { success: true as const };
}
export async function setDefaultAddress(formData: FormData) {
  const user = await requireUser(); const id = String(formData.get("id") || ""); const address = await prisma.userAddress.findFirst({ where: { id, userId: user.id } }); if (!address) return { error: "Address not found." };
  await prisma.$transaction([prisma.userAddress.updateMany({ where: { userId: user.id }, data: { isDefault: false } }), prisma.userAddress.update({ where: { id }, data: { isDefault: true } })]);
  revalidatePath("/account"); revalidatePath("/checkout"); return { success: true as const };
}
export async function requestPasswordReset(formData: FormData) {
  const email = emailOf(formData.get("email")); if (!email) return { error: "Email is required." };
  const user = await prisma.user.findUnique({ where: { email } }); const generic = { success: true as const, message: "If an account exists for that email, a reset link has been sent to it." }; if (!user) return generic;
  const rawToken = crypto.randomBytes(32).toString("hex"); await prisma.user.update({ where: { id: user.id }, data: { resetTokenHash: hashToken(rawToken), resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) } });
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"; const resetUrl = `${baseUrl}/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`;
  try { await sendPasswordResetEmail(email, resetUrl); } catch { return { error: "Something went wrong sending the reset email. Please try again shortly." }; }
  return generic;
}
export async function resetPassword(formData: FormData) {
  const email = emailOf(formData.get("email")); const token = String(formData.get("token") || ""); const password = String(formData.get("password") || "");
  if (!email || !token || !password) return { error: "All fields are required." }; if (password.length < 8) return { error: "Password must be at least 8 characters." };
  const user = await prisma.user.findUnique({ where: { email } }); if (!user?.resetTokenHash || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) return { error: "This reset link is invalid or has expired." };
  if (hashToken(token) !== user.resetTokenHash) return { error: "This reset link is invalid or has expired." };
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 12), resetTokenHash: null, resetTokenExpiresAt: null } }); await createSession(user.id); return { success: true as const };
}
