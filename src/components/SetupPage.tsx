"use client";

import { useState, useCallback } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";

export default function SetupPage() {
  const { setupStep } = useAuth();

  if (setupStep === "name") return <NameStep />;
  if (setupStep === "username") return <UsernameStep />;
  return null;
}

function NameStep() {
  const { saveName } = useAuth();
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) { setError("Please enter your name."); return; }
    try { await saveName(name.trim()); } catch { setError("Could not save name. Try again."); }
  };

  return (
    <div className="setup-container">
      <div className="setup-step">Step 1 of 2</div>
      <h2>What&apos;s your name?</h2>
      <p className="setup-desc">This is how others will see you in chats.</p>
      {error && <div className="error-msg">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="setup-name">Display Name</label>
          <input id="setup-name" type="text" value={name}
            onChange={(e) => setName(e.target.value)} required
            placeholder="Your name" maxLength={50} autoFocus />
        </div>
        <button type="submit" className="btn btn-primary btn-full">Continue</button>
      </form>
    </div>
  );
}

function UsernameStep() {
  const { saveUsername, user } = useAuth();
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);

  const checkUsername = useCallback(async (value: string) => {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed || trimmed.length < 3 || !/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      setAvailable(null);
      return;
    }
    setChecking(true);
    try {
      const snap = await getDocs(
        query(collection(db, "users"), where("username", "==", trimmed), limit(1))
      );
      setAvailable(snap.empty || snap.docs[0].id === user?.uid);
    } catch {
      setAvailable(null);
    }
    setChecking(false);
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const trimmed = username.trim().toLowerCase();
    if (!trimmed || !/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      setError("Only letters, numbers, and underscores allowed.");
      return;
    }
    if (trimmed.length < 3) {
      setError("Username must be at least 3 characters.");
      return;
    }
    setLoading(true);
    try {
      // Check uniqueness
      const snap = await getDocs(
        query(collection(db, "users"), where("username", "==", trimmed), limit(1))
      );
      if (!snap.empty && snap.docs[0].id !== user?.uid) {
        setError("This username is already taken. Choose another one.");
        setAvailable(false);
        setLoading(false);
        return;
      }
      await saveUsername(trimmed);
    } catch {
      setError("Could not save username. Try again.");
    }
    setLoading(false);
  };

  return (
    <div className="setup-container">
      <div className="setup-step">Step 2 of 2</div>
      <h2>Choose a username</h2>
      <p className="setup-desc">Others can find you by your username.</p>
      {error && <div className="error-msg">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="setup-username">Username</label>
          <input
            id="setup-username" type="text" value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setError("");
              if (e.target.value.trim().length >= 3) {
                checkUsername(e.target.value);
              } else {
                setAvailable(null);
              }
            }}
            required placeholder="e.g. john_doe"
            title="Letters, numbers, and underscores only"
            maxLength={30} autoFocus
          />
          {username.trim().length >= 3 && (
            <div className={`username-check ${checking ? "checking" : available ? "available" : "taken"}`}>
              {checking ? "Checking..." : available ? (
                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg> @{username.trim().toLowerCase()} is available</>
              ) : (
                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" /></svg> Username is taken</>
              )}
            </div>
          )}
        </div>
        <button type="submit" className="btn btn-primary btn-full" disabled={loading || available === false}>
          {loading ? "Checking..." : "Finish Setup"}
        </button>
      </form>
    </div>
  );
}
