"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { login, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  // Already logged in → redirect immediately
  useEffect(() => {
    if (user) router.replace(searchParams.get("from") ?? "/");
  }, [user, router, searchParams]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = login(email, password);
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? "Login failed");
    } else {
      router.replace(searchParams.get("from") ?? "/");
    }
  }

  return (
    <div className="min-h-screen bg-[#0B0F14] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo / title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 mb-4 shadow-md">
            <span className="text-white text-xl font-bold">CR</span>
          </div>
          <h1 className="text-2xl font-bold text-[#F9FAFB]">AutoCRM</h1>
          <p className="text-sm text-[#9CA3AF] mt-1">Car Sales Platform — Sign in</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[#111827] rounded-2xl border border-[#1F2937] shadow-sm shadow-black/10 p-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Email</label>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full border border-[#374151] rounded-lg px-3 py-2.5 text-sm text-[#F9FAFB] placeholder-gray-600 bg-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Password</label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full border border-[#374151] rounded-lg px-3 py-2.5 text-sm text-[#F9FAFB] placeholder-gray-600 bg-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white font-medium py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {/* Demo credentials hint */}
        <div className="mt-4 bg-[#111827] border border-[#1F2937] rounded-xl p-4 space-y-2 text-xs text-[#9CA3AF]">
          <p className="font-semibold text-gray-300">Demo accounts</p>
          <div className="flex justify-between">
            <span>admin@crm.com / admin123</span>
            <span className="bg-purple-100 text-purple-700 rounded-full px-2 py-0.5 font-medium">Admin</span>
          </div>
          <div className="flex justify-between">
            <span>sales@crm.com / sales123</span>
            <span className="bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 font-medium">Sales Rep</span>
          </div>
          <div className="flex justify-between">
            <span>senior@crm.com / senior123</span>
            <span className="bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 font-medium">Senior Rep</span>
          </div>
          <div className="flex justify-between">
            <span>manager@crm.com / manager123</span>
            <span className="bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-medium">Manager</span>
          </div>
        </div>
      </div>
    </div>
  );
}
