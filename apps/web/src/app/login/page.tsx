"use client";

import { FormEvent, useEffect, useState } from "react";
import { Lock, Mail, User } from "lucide-react";
import { KubeHubHero, KubeHubLogo } from "@/components/KubeHubLogo";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { api, ApiError, type RegistrationStatus } from "@/lib/api";
import { setToken } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [registration, setRegistration] = useState<RegistrationStatus | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ email: "", username: "", password: "" });

  useEffect(() => {
    api.registrationStatus().then(setRegistration).catch(() => {
      setRegistration({ enabled: false, bootstrap: false });
    });
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (mode === "register") {
        await api.register(form.email, form.username, form.password);
      }
      const { access_token } = await api.login(form.username, form.password);
      setToken(access_token);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  const showRegister = registration?.enabled ?? false;

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <div className="dot-grid pointer-events-none absolute inset-0 opacity-40" />
      <div className="relative flex justify-end p-4">
        <ThemeToggle />
      </div>
      <div className="relative flex flex-1 items-center justify-center p-4">
        <div className="grid w-full max-w-4xl gap-12 lg:grid-cols-2 lg:items-center">
          <div className="hidden lg:block">
            <div className="mb-8 text-primary">
              <KubeHubHero size={300} />
            </div>
            <h1 className="mb-3 text-3xl font-semibold tracking-tight text-foreground">KubeHub</h1>
            <p className="max-w-sm text-muted-foreground leading-relaxed">
              Explorez et pilotez tous vos clusters Kubernetes depuis une console web unique — façon Lens.
            </p>
          </div>

          <div className="rounded-xl border border-border/80 bg-card p-8 shadow-sm">
            <div className="mb-6 flex justify-center lg:hidden text-primary">
              <KubeHubLogo size="lg" framed />
            </div>

            {showRegister ? (
              <div className="mb-6 flex rounded-lg border border-border bg-muted/50 p-1">
                {(["login", "register"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                      mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                    }`}
                  >
                    {m === "login" ? "Connexion" : "Inscription"}
                  </button>
                ))}
              </div>
            ) : (
              <h2 className="mb-6 text-lg font-medium text-foreground">Connexion</h2>
            )}

            {registration?.bootstrap && mode === "register" && (
              <p className="mb-4 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                Premier lancement — créez le compte administrateur.
              </p>
            )}

            <form onSubmit={submit} className="space-y-4">
              {mode === "register" && showRegister && (
                <div>
                  <label className="label">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="email"
                      className="input-field pl-10"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      required={mode === "register"}
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="label">Utilisateur</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    className="input-field pl-10"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="label">Mot de passe</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="password"
                    className="input-field pl-10"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    minLength={8}
                    required
                  />
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? "Chargement…" : mode === "login" ? "Se connecter" : "Créer le compte"}
              </button>
            </form>

            {!showRegister && (
              <p className="mt-4 text-center text-xs text-muted-foreground">
                Inscription publique désactivée.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
