"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { UserData } from "@/lib/types";
import Sidebar from "./Sidebar";
import ChatArea from "./ChatArea";
import SettingsPanel from "./SettingsPanel";

type MobileTab = "chats" | "settings";

export default function ChatPage() {
  const { user, userData, logOut } = useAuth();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [mobileTab, setMobileTab] = useState<MobileTab>("chats");
  const [hasUnread, setHasUnread] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<(UserData & { id: string })[]>([]);
  const [searching, setSearching] = useState(false);
  const [requestSent, setRequestSent] = useState<Set<string>>(new Set());
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleOpenChat = useCallback(
    async (chatOrUserId: string) => {
      if (!user) return;
      // Try as chat ID
      const chatDoc = await getDoc(doc(db, "chats", chatOrUserId));
      if (chatDoc.exists()) {
        setActiveChatId(chatOrUserId);
        if (window.innerWidth <= 768) setShowSidebar(false);
        return chatOrUserId;
      }
      // Not a chat - ignore (chat creation is now via requests)
    },
    [user]
  );

  const handleBackToSidebar = useCallback(() => {
    setActiveChatId(null);
    setShowSidebar(true);
  }, []);

  const handleMobileTabChange = useCallback((tab: MobileTab) => {
    setMobileTab(tab);
    if (tab === "chats") {
      setActiveChatId(null);
      setShowSidebar(true);
    }
  }, []);

  // Search users for new chat
  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!value || value.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      const q = value.trim().toLowerCase();
      const results: (UserData & { id: string })[] = [];
      try {
        const emailSnap = await getDocs(query(collection(db, "users"), where("email", "==", q), limit(5)));
        emailSnap.docs.forEach((d) => {
          if (d.id !== user?.uid) results.push({ id: d.id, ...(d.data() as UserData) });
        });
        const usernameSnap = await getDocs(query(collection(db, "users"), where("username", "==", q), limit(5)));
        usernameSnap.docs.forEach((d) => {
          if (d.id !== user?.uid && !results.find((r) => r.id === d.id))
            results.push({ id: d.id, ...(d.data() as UserData) });
        });
      } catch { /* ignore */ }
      setSearchResults(results);
      setSearching(false);
    }, 350);
  }, [user]);

  // Send chat request
  const sendChatRequest = useCallback(async (targetUserId: string) => {
    if (!user || !userData) return;
    // Check if request already exists
    const existing = await getDocs(query(
      collection(db, "chatRequests"),
      where("from", "==", user.uid),
      where("to", "==", targetUserId),
      where("status", "==", "pending"),
      limit(1)
    ));
    if (!existing.empty) {
      setRequestSent((prev) => new Set(prev).add(targetUserId));
      return;
    }
    // Also check reverse
    const reverse = await getDocs(query(
      collection(db, "chatRequests"),
      where("from", "==", targetUserId),
      where("to", "==", user.uid),
      where("status", "==", "pending"),
      limit(1)
    ));
    if (!reverse.empty) {
      // Auto-accept: they already sent us a request
      const reqDoc = reverse.docs[0];
      await addDoc(collection(db, "chats"), {
        participants: [user.uid, targetUserId],
        type: "direct", createdBy: targetUserId,
        createdAt: serverTimestamp(), lastMessage: "", lastMessageTime: serverTimestamp(),
      });
      const { updateDoc } = await import("firebase/firestore");
      await updateDoc(doc(db, "chatRequests", reqDoc.id), { status: "accepted" });
      setShowNewChat(false);
      return;
    }
    await addDoc(collection(db, "chatRequests"), {
      from: user.uid,
      fromName: userData.name || userData.username,
      fromUsername: userData.username,
      to: targetUserId,
      status: "pending",
      createdAt: serverTimestamp(),
    });
    setRequestSent((prev) => new Set(prev).add(targetUserId));
  }, [user, userData]);

  return (
    <div className="chat-layout">
      {/* Sidebar */}
      <div className={`sidebar-wrapper ${showSidebar ? "visible" : "hidden-mobile"}`}>
        {mobileTab === "settings" ? (
          <SettingsPanel onClose={() => setMobileTab("chats")} />
        ) : (
          <Sidebar
            activeChatId={activeChatId}
            onOpenChat={handleOpenChat}
            onSignOut={logOut}
            onUnreadChange={setHasUnread}
            onShowNewChat={() => setShowNewChat(true)}
          />
        )}
      </div>

      {/* Chat area */}
      <div className={`chat-main-wrapper ${!showSidebar ? "visible-mobile" : ""}`}>
        <ChatArea chatId={activeChatId} onBack={handleBackToSidebar} />
      </div>

      {/* Floating New Chat Button (FAB) */}
      <button className="fab-new-chat" onClick={() => setShowNewChat(true)} title="New Chat">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      {/* New Chat Modal */}
      {showNewChat && (
        <div className="modal" onClick={() => { setShowNewChat(false); setSearchQuery(""); setSearchResults([]); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>New Chat</h3>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16 }}>
              Search for a user by username or email. A chat request will be sent.
            </p>
            <div className="form-group">
              <input type="text" placeholder="Search by username or email..."
                value={searchQuery} onChange={(e) => handleSearch(e.target.value)} autoFocus />
            </div>
            {searching && <div className="search-no-results">Searching...</div>}
            {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
              <div className="search-no-results">No users found</div>
            )}
            {searchResults.map((u) => (
              <div key={u.id} className="search-result-item">
                <div className="search-result-avatar">{(u.name || u.username || "?").charAt(0).toUpperCase()}</div>
                <div className="search-result-info">
                  <div className="search-result-name">{u.name}</div>
                  <div className="search-result-username">@{u.username}</div>
                </div>
                {requestSent.has(u.id) ? (
                  <span style={{ fontSize: 12, color: "var(--success)", fontWeight: 600, whiteSpace: "nowrap" }}>Request Sent</span>
                ) : (
                  <button className="btn btn-primary btn-sm" onClick={() => sendChatRequest(u.id)}>
                    Send Request
                  </button>
                )}
              </div>
            ))}
            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button className="btn btn-outline" onClick={() => { setShowNewChat(false); setSearchQuery(""); setSearchResults([]); }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile bottom nav */}
      <div className="mobile-bottom-nav">
        <div className="mobile-bottom-nav-inner">
          <button
            className={`mobile-nav-item ${mobileTab === "chats" ? "active" : ""}`}
            onClick={() => handleMobileTabChange("chats")}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            <span>Chats</span>
            {hasUnread && <div className="mobile-nav-badge" />}
          </button>
          <button
            className={`mobile-nav-item ${mobileTab === "settings" ? "active" : ""}`}
            onClick={() => handleMobileTabChange("settings")}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
            <span>Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
}
