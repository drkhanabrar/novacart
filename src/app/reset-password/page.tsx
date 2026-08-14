'use client';

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { resetPassword } from "@/actions/auth";
import { Hexagon, Lock, ArrowRight } from "lucide-react";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const email = searchParams.get("email") || "";

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    formData.set("token", token);
    formData.set("email", email);

    const res = await resetPassword(formData);

    if (res.error) {
      setError(res.error);
      setLoading(false);
    } else {
      setSuccess(true);
      setTimeout(() => router.push("/login"), 2000);
    }
  }

  if (!token || !email) {
    return (
      <div className="mb-2 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm text-center">
        This reset link is missing required information. Please request a new one from the{" "}
        <Link href="/forgot-password" className="underline">
          forgot password
        </Link>{" "}
        page.
      </div>
    );
  }

  if (success) {
    return (
      <div className="mb-2 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm text-center">
        Your password has been reset. Redirecting to sign in...
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm text-center">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="space-y-1">
          <label className="text-xs font-mono text-neutral-400 uppercase tracking-wider">New Password</label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-neutral-500" />
            <input
              name="password"
              type="password"
              required
              minLength={8}
              placeholder="••••••••"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-10 py-3 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-mono text-neutral-400 uppercase tracking-wider">Confirm Password</label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-neutral-500" />
            <input
              name="confirmPassword"
              type="password"
              required
              minLength={8}
              placeholder="••••••••"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-10 py-3 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-2 w-full py-3.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? "Resetting..." : "Reset password"}
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-neutral-900/50 border border-neutral-800 rounded-3xl p-8 backdrop-blur-md">
        <div className="flex flex-col items-center mb-8">
          <Hexagon className="w-10 h-10 text-indigo-500 fill-indigo-500/20 mb-3" />
          <h1 className="text-2xl font-bold text-white tracking-tight">Set New Password</h1>
          <p className="text-sm text-neutral-400 mt-1">Choose a new password for your account</p>
        </div>

        <Suspense fallback={<div className="text-center text-sm text-neutral-400">Loading...</div>}>
          <ResetPasswordForm />
        </Suspense>

        <p className="text-center text-sm text-neutral-400 mt-6">
          <Link href="/login" className="text-indigo-400 hover:underline font-medium">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
