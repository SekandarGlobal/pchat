"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";

export default function SetupPage() {
  const { setupStep, saveName, saveUsername } = useAuth();

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
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    try {
      await saveName(name.trim());
    } catch {
      setError("Could not save name. Try again.");
    }
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
          <input
            id="setup-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Your name"
            maxLength={50}
            autoFocus
          />
        </div>
        <button type="submit" className="btn btn-primary btn-full">
          Continue
        </button>
      </form>
    </div>
  );
}

function UsernameStep() {
  const { saveUsername } = useAuth();
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
            id="setup-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            placeholder="e.g. john_doe"
            pattern="[a-zA-Z0-9_]+"
            title="Letters, numbers, and underscores only"
            maxLength={30}
            autoFocus
          />
        </div>
        <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
          {loading ? "Checking..." : "Finish Setup"}
        </button>
      </form>
    </div>
  );
}
