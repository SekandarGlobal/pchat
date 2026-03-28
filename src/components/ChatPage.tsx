"use client";

import { useState, useCallback, useRef } from "react";
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

const TAB_CHATS = "chats";
const TAB_SETTINGS = "settings";
const TAB_SEARCH = "search";

export default function ChatPage() {
  const { user, userData, logOut } = useAuth();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [mobileTab, setMobileTab] = useState<string>(TAB_CHATS);
  const [hasUnread, setHasUnread] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<(UserData & { id: string })[]>([]);
  const [searching, setSearching] = useState(false);
  const [requestSent, setRequestSent] = useState<Set<string>>(new Set());
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isInChat = activeChatId !== null;

  const handleOpenChat = useCallback(
    async (chatOrUserId: string) => {
      if (!user) return;
      const chatDoc = await getDoc(doc(db, "chats", chatOrUserId));
      if (chatDoc.exists()) {
        setActiveChatId(chatOrUserId);
        setShowSidebar(false);
        setMobileTab(TAB_CHATS);
        return chatOrUserId;
      }
    },
    [user]
  );

  const handleBackToSidebar = useCallback(() => {
    setActiveChatId(null);
    setShowSidebar(true);
  }, []);

  const handleMobileTabChange = useCallback((tab: string) => {
    setMobileTab(tab);
    setActiveChatId(null);
    setShowSidebar(true);
  }, []);

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

  const sendChatRequest = useCallback(async (targetUserId: string) => {
    if (!user || !userData) return;
    const existing = await getDocs(query(
      collection(db, "chatRequests"),
      where("from", "==", user.uid), where("to", "==", targetUserId),
      where("status", "==", "pending"), limit(1)
    ));
    if (!existing.empty) { setRequestSent((p) => new Set(p).add(targetUserId)); return; }
    const reverse = await getDocs(query(
      collection(db, "chatRequests"),
      where("from", "==", targetUserId), where("to", "==", user.uid),
      where("status", "==", "pending"), limit(1)
    ));
    if (!reverse.empty) {
      const reqDoc = reverse.docs[0];
      await addDoc(collection(db, "chats"), {
        participants: [user.uid, targetUserId], type: "direct", createdBy: targetUserId,
        createdAt: serverTimestamp(), lastMessage: "", lastMessageTime: serverTimestamp(),
      });
      const { updateDoc } = await import("firebase/firestore");
      await updateDoc(doc(db, "chatRequests", reqDoc.id), { status: "accepted" });
      handleBackToSidebar();
      return;
    }
    await addDoc(collection(db, "chatRequests"), {
      from: user.uid, fromName: userData.name || userData.username,
      fromUsername: userData.username, to: targetUserId,
      status: "pending", createdAt: serverTimestamp(),
    });
    setRequestSent((p) => new Set(p).add(targetUserId));
  }, [user, userData, handleBackToSidebar]);

  return (
    <div className="chat-layout">
      {/* Sidebar - hidden on mobile when in chat or search */}
      <div className={`sidebar-wrapper ${showSidebar && !isInChat && mobileTab !== TAB_SEARCH ? "visible" : "hidden-mobile"}`}>
        {mobileTab === TAB_SETTINGS ? (
          <SettingsPanel onClose={() => setMobileTab(TAB_CHATS)} />
        ) : (
          <Sidebar
            activeChatId={activeChatId}
            onOpenChat={handleOpenChat}
            onSignOut={logOut}
            onUnreadChange={setHasUnread}
            onShowNewChat={() => handleMobileTabChange(TAB_SEARCH)}
          />
        )}
      </div>

      {/* Chat area */}
      <div className={`chat-main-wrapper ${isInChat ? "visible-mobile" : ""}`}>
        <ChatArea chatId={activeChatId} onBack={handleBackToSidebar} />
      </div>

      {/* Search page (full page, not modal) */}
      {mobileTab === TAB_SEARCH && !isInChat && (
        <div className="search-page">
          <div className="search-page-header">
            <button className="btn-back-sidebar" style={{ display: "flex" }} onClick={() => handleMobileTabChange(TAB_CHATS)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <h3>Find People</h3>
          </div>
          <div className="search-page-input-wrapper">
            <input
              type="text"
              className="search-page-input"
              placeholder="Search by username or email..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="search-page-results">
            {searching && <div className="search-no-results">Searching...</div>}
            {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
              <div className="search-no-results">No users found</div>
            )}
            {searchQuery.length < 2 && searchQuery.length > 0 && (
              <div className="search-no-results">Type at least 2 characters</div>
            )}
            {searchQuery.length === 0 && (
              <div className="search-no-results">Search for users by username or email to send a chat request</div>
            )}
            {searchResults.map((u) => (
              <div key={u.id} className="search-result-item">
                <div className="search-result-avatar">
                  {(u.name || u.username || "?").charAt(0).toUpperCase()}
                </div>
                <div className="search-result-info">
                  <div className="search-result-name">{u.name}</div>
                  <div className="search-result-username">@{u.username}</div>
                </div>
                {requestSent.has(u.id) ? (
                  <span className="request-sent-label">Sent</span>
                ) : (
                  <button className="btn btn-primary btn-sm" onClick={() => sendChatRequest(u.id)}>
                    Request
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FAB - only on chats list, not in chat or search */}
      {!isInChat && mobileTab !== TAB_SEARCH && (
        <button className="fab-new-chat" onClick={() => handleMobileTabChange(TAB_SEARCH)} title="Find People">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
        </button>
      )}

      {/* Mobile bottom nav - hidden when in chat or search */}
      {!isInChat && mobileTab !== TAB_SEARCH && (
        <div className="mobile-bottom-nav">
          <div className="mobile-bottom-nav-inner">
            <button
              className={`mobile-nav-item ${mobileTab === TAB_CHATS ? "active" : ""}`}
              onClick={() => handleMobileTabChange(TAB_CHATS)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
              <span>Chats</span>
              {hasUnread && <div className="mobile-nav-badge" />}
            </button>
            <button
              className={`mobile-nav-item ${mobileTab === TAB_SEARCH ? "active" : ""}`}
              onClick={() => handleMobileTabChange(TAB_SEARCH)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <span>Search</span>
            </button>
            <button
              className={`mobile-nav-item ${mobileTab === TAB_SETTINGS ? "active" : ""}`}
              onClick={() => handleMobileTabChange(TAB_SETTINGS)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
              <span>Settings</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
