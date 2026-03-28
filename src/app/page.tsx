"use client";

import { useState } from "react";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import LandingPage from "@/components/LandingPage";
import AuthPage from "@/components/AuthPage";
import SetupPage from "@/components/SetupPage";
import ChatPage from "@/components/ChatPage";

function AppContent() {
  const { user, loading, setupStep } = useAuth();
  const [authMode, setAuthMode] = useState<"landing" | "signin" | "signup">("landing");

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  // Authenticated user
  if (user) {
    if (setupStep === "name" || setupStep === "username") {
      return <SetupPage />;
    }
    if (setupStep === "done") {
      return <ChatPage />;
    }
  }

  // Not authenticated
  if (authMode === "landing") {
    return <LandingPage onNavigate={setAuthMode} />;
  }

  return <AuthPage mode={authMode === "signin" ? "signin" : "signup"} onSwitch={setAuthMode} />;
}

export default function Home() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
