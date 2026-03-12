'use client';

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { persistDemoSession } from "@/lib/authClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Error de login");
      return;
    }
    const sessionRes = await fetch("/api/auth/session", {
      credentials: "same-origin",
    });
    const session = await sessionRes.json();
    if (session.user) {
      persistDemoSession({
        id: session.user.id,
        email: session.user.email,
        role: session.user.role,
      });
    }
    if (session.user?.role === "company") router.push("/company");
    else router.push("/passenger");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-slate-900">Iniciar sesión</h1>
        <p className="mb-4 text-sm text-slate-500">
          Demo: contraseña <code className="rounded bg-slate-100 px-1">demo</code>
        </p>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            className="w-full rounded-lg bg-sky-600 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            Entrar
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-600">
          ¿No tenés cuenta?{" "}
          <Link href="/register" className="font-medium text-sky-600 hover:underline">
            Registrarse
          </Link>
        </p>
        <p className="mt-2 text-center text-xs text-slate-400">
          Pasajero: ana@demo.com / luis@demo.com · Empresa: admin@flechabus.demo · admin@plusmar.demo
        </p>
        <p className="mt-4 text-center">
          <Link
            href="/"
            className="text-sm font-medium text-slate-600 hover:text-slate-900 hover:underline"
          >
            Volver al inicio
          </Link>
        </p>
      </div>
    </main>
  );
}
