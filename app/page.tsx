import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4 text-slate-50">
      <div className="w-full max-w-3xl rounded-2xl bg-slate-900/60 p-8 shadow-2xl ring-1 ring-slate-700/60 backdrop-blur">
        <header className="mb-8 text-center">
          <p className="mb-2 text-sm font-medium uppercase tracking-[0.2em] text-sky-400">
            Seguimiento en tiempo real
          </p>
          <h1 className="mb-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            Bus Tracker
          </h1>
          <p className="text-sm text-slate-300 sm:text-base">
            Visualizá el estado de tu viaje en vivo o gestioná la flota de tu
            empresa desde un solo lugar.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/passenger"
            className="group flex flex-col justify-between rounded-xl border border-slate-700 bg-slate-900/80 p-5 text-left shadow-sm transition hover:border-sky-400 hover:bg-slate-900"
          >
            <div>
              <h2 className="mb-1 text-lg font-semibold text-slate-50">
                Soy Pasajero
              </h2>
              <p className="text-sm text-slate-300">
                Ingresá el código de tu pasaje y seguí la ubicación del micro
                en tiempo real.
              </p>
            </div>
            <span className="mt-4 inline-flex items-center text-sm font-medium text-sky-400">
              Ir al seguimiento
              <span className="ml-1 transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </span>
          </Link>

          <Link
            href="/company"
            className="group flex flex-col justify-between rounded-xl border border-slate-700 bg-slate-900/80 p-5 text-left shadow-sm transition hover:border-emerald-400 hover:bg-slate-900"
          >
            <div>
              <h2 className="mb-1 text-lg font-semibold text-slate-50">
                Soy Empresa
              </h2>
              <p className="text-sm text-slate-300">
                Accedé al panel de control para ver la flota, crear y resolver
                incidentes.
              </p>
            </div>
            <span className="mt-4 inline-flex items-center text-sm font-medium text-emerald-400">
              Ir al dashboard
              <span className="ml-1 transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </span>
          </Link>
        </div>

        <p className="mt-4 text-center text-sm">
          <Link
            href="/login"
            className="font-medium text-sky-400 hover:underline"
          >
            Iniciar sesión
          </Link>
          {" · "}
          <Link
            href="/register"
            className="font-medium text-sky-400 hover:underline"
          >
            Registrarse
          </Link>
        </p>
        <p className="mt-4 text-center text-xs text-slate-400">
          Datos de prueba en memoria. No se almacena información real.
        </p>
      </div>
    </main>
  );
}