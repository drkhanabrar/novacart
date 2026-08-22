// FILE: src/app/login/page.tsx
// Based on the existing NovaCart login flow: :contentReference[oaicite:0]{index=0}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  Mail,
} from "lucide-react";
import { loginUser } from "@/actions/auth";

export default function LoginPage() {
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);

    formData.set(
      "rememberMe",
      rememberMe ? "on" : "off",
    );

    try {
      const result = await loginUser(formData);

      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }

      const next = new URLSearchParams(
        window.location.search,
      ).get("next");

      router.push(
        next && next.startsWith("/")
          ? next
          : "/products",
      );

      router.refresh();
    } catch (loginError) {
      console.error("Login failed:", loginError);
      setError(
        "Something went wrong while signing in. Please try again.",
      );
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-14">
      <div className="w-full max-w-md rounded-[30px] border border-ink/10 bg-card p-8 shadow-xl shadow-ink/5 sm:p-10">
        <div className="mb-8 text-center">
          <img
            src="/logo.png"
            alt="NovaCart"
            className="mx-auto mb-5 h-8 w-auto object-contain"
          />

          <span className="font-tag text-[10px] uppercase tracking-[.18em] text-poppy">
            Welcome back
          </span>

          <h1 className="mt-2 font-display text-4xl italic text-ink">
            Sign in.
          </h1>

          <p className="mt-1 text-sm text-ink-soft">
            Access your account, orders and saved addresses.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-poppy/20 bg-poppy/10 p-4 text-sm text-poppy-dark">
            {error}
          </div>
        )}

        <form
          onSubmit={submit}
          className="space-y-5"
        >
          <label className="block">
            <span className="font-tag text-[10px] uppercase tracking-wider text-ink-soft">
              Email address
            </span>

            <span className="relative mt-1.5 block">
              <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-ink-soft" />

              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                className="w-full rounded-xl border border-ink/15 bg-cream px-10 py-3.5 text-sm outline-none focus:border-poppy"
                placeholder="name@example.com"
              />
            </span>
          </label>

          <label className="block">
            <span className="font-tag text-[10px] uppercase tracking-wider text-ink-soft">
              Password
            </span>

            <span className="relative mt-1.5 block">
              <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-ink-soft" />

              <input
                name="password"
                type={
                  showPassword
                    ? "text"
                    : "password"
                }
                required
                autoComplete="current-password"
                className="w-full rounded-xl border border-ink/15 bg-cream py-3.5 pl-10 pr-12 text-sm outline-none focus:border-poppy"
                placeholder="••••••••"
              />

              <button
                type="button"
                onClick={() =>
                  setShowPassword((value) => !value)
                }
                aria-label={
                  showPassword
                    ? "Hide password"
                    : "Show password"
                }
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-soft transition hover:bg-ink/5 hover:text-ink"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </span>
          </label>

          <div className="flex items-center justify-between gap-4">
            <label className="inline-flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                name="rememberMe"
                checked={rememberMe}
                onChange={(e) =>
                  setRememberMe(e.target.checked)
                }
                className="h-4 w-4 rounded border-ink/20 accent-poppy"
              />

              <span className="text-xs font-semibold text-ink-soft">
                Keep me logged in
              </span>
            </label>

            <Link
              href="/forgot-password"
              className="text-xs font-semibold text-poppy hover:underline"
            >
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-poppy py-3.5 text-sm font-semibold text-white shadow-lg shadow-poppy/20 hover:bg-poppy-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? "Signing in…"
              : "Sign in"}

            {!loading && (
              <ArrowRight className="h-4 w-4" />
            )}
          </button>
        </form>

        <p className="mt-7 text-center text-sm text-ink-soft">
          New to NovaCart?{" "}
          <Link
            href="/register"
            className="font-semibold text-poppy hover:underline"
          >
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}