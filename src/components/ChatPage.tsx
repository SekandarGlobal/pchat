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

export default function ChatPage() {
  const { user, logOut } = useAuth();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);

  const handleOpenChat = useCallback(
    async (chatOrUserId: string) => {
      if (!user) return;

      // Check if it's a chat ID first
      const chatDoc = await getDoc(doc(db, "chats", chatOrUserId));
      if (chatDoc.exists()) {
        setActiveChatId(chatOrUserId);
        if (window.innerWidth <= 768) setShowSidebar(false);
        return chatOrUserId;
      }

      // It's a user ID - find or create direct chat
      const userId = chatOrUserId;
      if (userId === user.uid) return;

      const chatsQuery = query(
        collection(db, "chats"),
        where("participants", "array-contains", user.uid),
        where("type", "==", "direct")
      );
      const snapshot = await getDocs(chatsQuery);
      let foundId: string | null = null;

      snapshot.docs.forEach((doc) => {
        const parts = doc.data().participants;
        if (parts.length === 2 && parts.includes(userId)) {
          foundId = doc.id;
        }
      });

      if (foundId) {
        setActiveChatId(foundId);
        if (window.innerWidth <= 768) setShowSidebar(false);
        return foundId;
      }

      // Create new chat
      const newChat = await addDoc(collection(db, "chats"), {
        participants: [user.uid, userId],
        type: "direct",
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        lastMessage: "",
        lastMessageTime: serverTimestamp(),
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

  return (
    <div className="chat-layout">
      <div className={`sidebar-wrapper ${showSidebar ? "visible" : "hidden-mobile"}`}>
        <Sidebar
          activeChatId={activeChatId}
          onOpenChat={handleOpenChat}
          onSignOut={logOut}
        />
      </div>
      <div className={`chat-main-wrapper ${!showSidebar ? "visible-mobile" : ""}`}>
        <ChatArea chatId={activeChatId} onStartChat={handleOpenChat} />
      </div>

      {/* Mobile back button overlay */}
      {activeChatId && !showSidebar && (
        <button className="mobile-back-btn" onClick={handleBackToSidebar}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
      )}
    </div>
  );
}
