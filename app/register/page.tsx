'use client';

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { persistDemoSession } from "@/lib/authClient";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"passenger" | "company">("passenger");
  const [companyName, setCompanyName] = useState("");
  const [companySlug, setCompanySlug] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const body: Record<string, string> = { name, email, password, role };
    if (role === "company") {
      body.companyName = companyName;
      body.companySlug = companySlug.toLowerCase().replace(/\s+/g, "-");
    }
    const res = await fetch("/api/auth/register", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Error al registrar");
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
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-xl font-semibold text-slate-900">Crear cuenta</h1>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Nombre</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              required
            />
          </div>
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
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Tipo</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "passenger" | "company")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="passenger">Pasajero</option>
              <option value="company">Empresa</option>
            </select>
          </div>
          {role === "company" && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Nombre empresa
                </label>
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Ej: Mi Empresa S.A."
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Slug (único)
                </label>
                <input
                  value={companySlug}
                  onChange={(e) => setCompanySlug(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="mi-empresa"
                  required
                />
              </div>
            </>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Registrarse
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-600">
          <Link href="/login" className="font-medium text-sky-600 hover:underline">
            Ya tengo cuenta
          </Link>
        </p>
        <p className="mt-3 text-center">
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
