"use client";

export default function LandingPage({ onNavigate }: { onNavigate: (mode: "landing" | "signin" | "signup") => void }) {
  return (
    <div className="landing-page">
      {/* Navigation */}
      <nav className="landing-nav">
        <div className="landing-nav-brand">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
          <span>ChatApp</span>
        </div>
        <div className="landing-nav-actions">
          <button className="btn-ghost" onClick={() => onNavigate("signin")}>Sign In</button>
          <button className="btn btn-primary btn-sm" onClick={() => onNavigate("signup")}>Get Started</button>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero-section">
        <div className="hero-glow" />
        <div className="hero-content">
          <div className="hero-badge">Real-time messaging</div>
          <h1 className="hero-title">
            Connect with<br />
            <span className="hero-gradient">everyone, instantly.</span>
          </h1>
          <p className="hero-subtitle">
            Fast, secure, and beautifully simple messaging. Chat one-on-one or in groups with real-time sync, read receipts, and typing indicators.
          </p>
          <div className="hero-cta">
            <button className="btn btn-primary btn-lg" onClick={() => onNavigate("signup")}>
              Start Chatting Free
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
            <button className="btn btn-outline-dark btn-lg" onClick={() => onNavigate("signin")}>
              Sign In
            </button>
          </div>
          <div className="hero-stats">
            <div className="hero-stat">
              <span className="hero-stat-number">Real-time</span>
              <span className="hero-stat-label">Message sync</span>
            </div>
            <div className="hero-stat-divider" />
            <div className="hero-stat">
              <span className="hero-stat-number">E2E</span>
              <span className="hero-stat-label">Secure</span>
            </div>
            <div className="hero-stat-divider" />
            <div className="hero-stat">
              <span className="hero-stat-number">Free</span>
              <span className="hero-stat-label">Forever</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="features-section">
        <div className="features-header">
          <h2>Everything you need to chat</h2>
          <p>Powerful features wrapped in a beautiful, simple interface</p>
        </div>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon feature-icon-blue">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <h3>Instant Messaging</h3>
            <p>Messages sync in real-time across all devices. No refresh needed.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon feature-icon-green">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
              </svg>
            </div>
            <h3>Group Chats</h3>
            <p>Create groups, add members, and manage conversations effortlessly.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon feature-icon-purple">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h3>Read Receipts</h3>
            <p>Know when your messages have been seen with built-in read receipts.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon feature-icon-orange">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </div>
            <h3>Edit & Delete</h3>
            <p>Edit sent messages or delete them for everyone. Full control.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon feature-icon-pink">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <h3>Typing Indicators</h3>
            <p>See when others are typing in real-time with animated indicators.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon feature-icon-teal">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                <path d="M12 18h.01" />
              </svg>
            </div>
            <h3>Mobile Ready</h3>
            <p>Fully responsive design that works perfectly on any device.</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <div className="cta-content">
          <h2>Ready to start chatting?</h2>
          <p>Join now and connect with friends, family, and colleagues.</p>
          <button className="btn btn-primary btn-lg" onClick={() => onNavigate("signup")}>
            Create Free Account
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <p>&copy; 2026 ChatApp. Built with love.</p>
      </footer>
    </div>
  );
}
