"use client";

import { useState, useCallback } from "react";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import Sidebar from "./Sidebar";
import ChatArea from "./ChatArea";
import SettingsPanel from "./SettingsPanel";

type MobileTab = "chats" | "settings";

export default function ChatPage() {
  const { user, logOut } = useAuth();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [mobileTab, setMobileTab] = useState<MobileTab>("chats");
  const [hasUnread, setHasUnread] = useState(false);

  const handleOpenChat = useCallback(
    async (chatOrUserId: string) => {
      if (!user) return;
      const chatDoc = await getDoc(doc(db, "chats", chatOrUserId));
      if (chatDoc.exists()) {
        setActiveChatId(chatOrUserId);
        if (window.innerWidth <= 768) setShowSidebar(false);
        return chatOrUserId;
      }
      const userId = chatOrUserId;
      if (userId === user.uid) return;
      const chatsQuery = query(
        collection(db, "chats"),
        where("participants", "array-contains", user.uid),
        where("type", "==", "direct")
      );
      const snapshot = await getDocs(chatsQuery);
      let foundId: string | null = null;
      snapshot.docs.forEach((d) => {
        const parts = d.data().participants;
        if (parts.length === 2 && parts.includes(userId)) foundId = d.id;
      });
      if (foundId) {
        setActiveChatId(foundId);
        if (window.innerWidth <= 768) setShowSidebar(false);
        return foundId;
      }
      const newChat = await addDoc(collection(db, "chats"), {
        participants: [user.uid, userId], type: "direct", createdBy: user.uid,
        createdAt: serverTimestamp(), lastMessage: "", lastMessageTime: serverTimestamp(),
      });
      setActiveChatId(newChat.id);
      if (window.innerWidth <= 768) setShowSidebar(false);
      return newChat.id;
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

  // hasUnread is updated via Sidebar's onUnreadChange callback

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
          />
        )}
      </div>

      {/* Chat area */}
      <div className={`chat-main-wrapper ${!showSidebar ? "visible-mobile" : ""}`}>
        <ChatArea chatId={activeChatId} onBack={handleBackToSidebar} />
      </div>

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
