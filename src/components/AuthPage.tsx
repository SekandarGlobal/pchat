"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { FirebaseError } from "firebase/app";

function friendlyError(code: string): string {
  switch (code) {
    case "auth/user-not-found":
      return "No account found with this email.";
    case "auth/wrong-password":
      return "Incorrect password.";
    case "auth/invalid-credential":
      return "Invalid email or password.";
    case "auth/email-already-in-use":
      return "This email is already registered.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/invalid-email":
      return "Invalid email address.";
    case "auth/popup-closed-by-user":
      return "Sign-in popup was closed.";
    case "auth/too-many-requests":
      return "Too many attempts. Try again later.";
    default:
      return "An error occurred. Please try again.";
  }
}

interface AuthPageProps {
  mode: "signin" | "signup";
  onSwitch: (mode: "landing" | "signin" | "signup") => void;
}

export default function AuthPage({ mode, onSwitch }: AuthPageProps) {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "signin") {
        await signIn(email, password);
      } else {
        await signUp(email, password);
      }
    } catch (err) {
      if (err instanceof FirebaseError) {
        setError(friendlyError(err.code));
      } else {
        setError("An error occurred. Please try again.");
      }
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setError("");
    try {
      await signInWithGoogle();
    } catch (err) {
      if (err instanceof FirebaseError) {
        setError(friendlyError(err.code));
      }
    }
  };

  return (
    <div className="auth-container">
      <button className="back-btn" onClick={() => onSwitch("landing")}>
        &larr; Back
      </button>
      <h2>{mode === "signin" ? "Sign In" : "Create Account"}</h2>

      {error && <div className="error-msg">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            autoComplete="email"
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder={mode === "signup" ? "Min 6 characters" : "Your password"}
            minLength={6}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
        </div>
        <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
          {loading
            ? mode === "signin"
              ? "Signing in..."
              : "Creating account..."
            : mode === "signin"
              ? "Sign In"
              : "Sign Up"}
        </button>
      </form>

      <div className="divider">
        <span>or</span>
      </div>

      <button className="btn btn-google btn-full" onClick={handleGoogle}>
        <svg viewBox="0 0 24 24" width="18" height="18">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
        Continue with Google
      </button>

      <p className="auth-switch">
        {mode === "signin" ? (
          <>
            Don&apos;t have an account?{" "}
            <a href="#" onClick={(e) => { e.preventDefault(); onSwitch("signup"); }}>
              Sign Up
            </a>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <a href="#" onClick={(e) => { e.preventDefault(); onSwitch("signin"); }}>
              Sign In
            </a>
          </>
        )}
      </p>
    </div>
  );
}
