"use client";

import { useState, useCallback } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";

interface SettingsPanelProps {
  onClose: () => void;
}

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { user, userData, logOut, refreshUserData } = useAuth();
  const [newUsername, setNewUsername] = useState("");
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const checkUsername = useCallback(async (username: string) => {
    const trimmed = username.trim().toLowerCase();
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

  const handleUsernameChange = useCallback(async () => {
    setError("");
    setSuccess("");
    const trimmed = newUsername.trim().toLowerCase();
    if (!trimmed || trimmed.length < 3 || !/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      setError("Username must be at least 3 characters, letters, numbers, and underscores only.");
      return;
    }
    if (trimmed === userData?.username) {
      setError("This is already your username.");
      return;
    }
    setSaving(true);
    try {
      // Double-check availability
      const snap = await getDocs(
        query(collection(db, "users"), where("username", "==", trimmed), limit(1))
      );
      if (!snap.empty && snap.docs[0].id !== user?.uid) {
        setError("This username is already taken.");
        setSaving(false);
        return;
      }
      if (user) {
        await updateDoc(doc(db, "users", user.uid), { username: trimmed });
        await refreshUserData();
        setSuccess("Username updated successfully!");
        setNewUsername("");
        setAvailable(null);
      }
    } catch {
      setError("Failed to update username. Try again.");
    }
    setSaving(false);
  }, [newUsername, user, userData, refreshUserData]);

  return (
    <div className="sidebar" style={{ overflowY: "auto" }}>
      <div className="sidebar-header">
        <h3>Settings</h3>
        <button className="btn-icon" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      <div className="settings-panel">
        {/* Profile */}
        <div className="settings-group">
          <div className="settings-group-title">Profile</div>
          <div className="settings-item">
            <div className="settings-item-info">
              <div className="settings-item-label">Name</div>
              <div className="settings-item-value">{userData?.name || "Not set"}</div>
            </div>
          </div>
          <div className="settings-item">
            <div className="settings-item-info">
              <div className="settings-item-label">Username</div>
              <div className="settings-item-value">@{userData?.username || "Not set"}</div>
            </div>
          </div>
          <div className="settings-item">
            <div className="settings-item-info">
              <div className="settings-item-label">Email</div>
              <div className="settings-item-value">{userData?.email || user?.email || "Not set"}</div>
            </div>
          </div>
        </div>

        {/* Change Username */}
        <div className="settings-group">
          <div className="settings-group-title">Change Username</div>
          {error && <div className="error-msg">{error}</div>}
          {success && (
            <div style={{
              background: "rgba(34, 197, 94, 0.1)", border: "1px solid rgba(34, 197, 94, 0.3)",
              color: "#86efac", padding: "10px 14px", borderRadius: "var(--radius)",
              fontSize: 13, marginBottom: 16,
            }}>
              {success}
            </div>
          )}
          <div className="form-group" style={{ marginBottom: 8 }}>
            <input
              type="text"
              placeholder="New username"
              value={newUsername}
              onChange={(e) => {
                setNewUsername(e.target.value);
                setError("");
                setSuccess("");
                if (e.target.value.trim().length >= 3) {
                  checkUsername(e.target.value);
                } else {
                  setAvailable(null);
                }
              }}
              maxLength={30}
            />
          </div>
          {newUsername.trim().length >= 3 && (
            <div className={`username-check ${checking ? "checking" : available ? "available" : "taken"}`}>
              {checking ? (
                "Checking..."
              ) : available ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  @{newUsername.trim().toLowerCase()} is available
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M15 9l-6 6M9 9l6 6" />
                  </svg>
                  Username is taken
                </>
              )}
            </div>
          )}
          <button
            className="btn btn-primary btn-full"
            style={{ marginTop: 12 }}
            onClick={handleUsernameChange}
            disabled={saving || !newUsername.trim() || available === false}
          >
            {saving ? "Saving..." : "Update Username"}
          </button>
        </div>

        {/* Sign Out */}
        <div className="settings-group">
          <button className="btn btn-outline btn-full" onClick={logOut} style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
