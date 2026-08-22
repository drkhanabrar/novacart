import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import CheckoutClient from "@/components/CheckoutClient";

export default async function CheckoutPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/checkout");

  const razorpayKeyId = process.env.RAZORPAY_KEY_ID ?? "";

  return <CheckoutClient user={user} razorpayKeyId={razorpayKeyId} />;
}
