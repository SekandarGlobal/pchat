"use client";

export default function LandingPage({ onNavigate }: { onNavigate: (mode: "landing" | "signin" | "signup") => void }) {
  return (
    <div className="landing-container">
      <div className="landing-hero">
        <div className="logo">ChatApp</div>
        <p className="tagline">Connect instantly. Chat freely.</p>
        <div className="landing-buttons">
          <button className="btn btn-primary" onClick={() => onNavigate("signin")}>
            Sign In
          </button>
          <button className="btn btn-outline" onClick={() => onNavigate("signup")}>
            Sign Up
          </button>
        </div>
      </div>
    </div>
  );
}
