'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loginUser } from "@/actions/auth";
import { Hexagon, Lock, Mail, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const res = await loginUser(formData);

    if (res.error) {
      setError(res.error);
      setLoading(false);
    } else {
      if (res.userId) {
        localStorage.setItem("novacart_user_id", res.userId);
        localStorage.setItem("novacart_user_name", res.name || "Customer");
      }
      router.push("/products");
      router.refresh();
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-neutral-900/50 border border-neutral-800 rounded-3xl p-8 backdrop-blur-md">
        <div className="flex flex-col items-center mb-8">
          <Hexagon className="w-10 h-10 text-indigo-500 fill-indigo-500/20 mb-3" />
          <h1 className="text-2xl font-bold text-white tracking-tight">Welcome Back</h1>
          <p className="text-sm text-neutral-400 mt-1">Sign in to your NOVA account</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="space-y-1">
            <label className="text-xs font-mono text-neutral-400 uppercase tracking-wider">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-neutral-500" />
              <input 
                name="email" 
                type="email" 
                required 
                placeholder="name@example.com" 
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-10 py-3 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-mono text-neutral-400 uppercase tracking-wider">Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-neutral-500" />
              <input 
                name="password" 
                type="password" 
                required 
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
            {loading ? "Signing in..." : "Sign In"}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <p className="text-center text-sm text-neutral-400 mt-6">
          Don't have an account?{" "}
          <Link href="/register" className="text-indigo-400 hover:underline font-medium">
            Create account
          </Link>
        </p>
      </div>
    </div>
  );
}