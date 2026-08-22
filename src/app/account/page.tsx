import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import AccountPanel from "@/components/AccountPanel";

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");

  return <AccountPanel user={user} />;
}
