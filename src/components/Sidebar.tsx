"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  limit,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { ref, onValue } from "firebase/database";
import { db, rtdb } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { ChatData, UserData, PresenceData } from "@/lib/types";

interface ChatListItem {
  id: string;
  chat: ChatData;
  displayName: string;
  initial: string;
  otherUserId: string | null;
  hasUnread: boolean;
}

interface SidebarProps {
  activeChatId: string | null;
  onOpenChat: (chatId: string) => void;
  onSignOut: () => void;
  onUnreadChange?: (hasUnread: boolean) => void;
}

export default function Sidebar({ activeChatId, onOpenChat, onSignOut, onUnreadChange }: SidebarProps) {
  const { user } = useAuth();
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<(UserData & { id: string })[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [userNames, setUserNames] = useState<Record<string, UserData>>({});
  const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>({});
  const [unreadChats, setUnreadChats] = useState<Set<string>>(new Set());
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchedUserIdsRef = useRef<Set<string>>(new Set());

  // Listen to user's chats
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "chats"),
      where("participants", "array-contains", user.uid),
      orderBy("lastMessageTime", "desc")
    );
    return onSnapshot(q, (snapshot) => {
      const chatList: ChatListItem[] = [];
      const userIds = new Set<string>();

      snapshot.docs.forEach((doc) => {
        const chat = doc.data() as ChatData;
        let displayName = "Chat";
        let initial = "?";
        let otherUserId: string | null = null;

        if (chat.type === "group") {
          displayName = chat.name || "Group";
          initial = displayName.charAt(0).toUpperCase();
        } else {
          otherUserId = chat.participants.find((id) => id !== user.uid) || null;
          if (otherUserId) {
            userIds.add(otherUserId);
          }
        }

        chatList.push({
          id: doc.id,
          chat,
          displayName,
          initial,
          otherUserId,
          hasUnread: false,
        });
      });

      // Fetch user names for direct chats
      userIds.forEach((uid) => {
        if (!fetchedUserIdsRef.current.has(uid)) {
          fetchedUserIdsRef.current.add(uid);
          getDocs(query(collection(db, "users"), where("__name__", "==", uid))).then((snap) => {
            if (!snap.empty) {
              setUserNames((prev) => ({
                ...prev,
                [uid]: snap.docs[0].data() as UserData,
              }));
            }
          });
        }
      });

      setChats(chatList);
    });
  }, [user]);

  // Memoize chat IDs for stable dependency
  const chatOtherUserIds = chats.map((c) => c.otherUserId).filter(Boolean).join(",");
  const chatIds = chats.map((c) => c.id).join(",");

  // Listen for online status of chat partners
  useEffect(() => {
    const unsubscribes: (() => void)[] = [];
    chats.forEach((chat) => {
      if (chat.otherUserId) {
        const unsub = onValue(ref(rtdb, `online/${chat.otherUserId}`), (snap) => {
          const val = snap.val() as PresenceData | null;
          setOnlineUsers((prev) => ({
            ...prev,
            [chat.otherUserId!]: val?.online || false,
          }));
        });
        unsubscribes.push(unsub);
      }
    });
    return () => unsubscribes.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatOtherUserIds]);

  // Listen for unread messages (messages not seen by current user)
  useEffect(() => {
    if (!user) return;
    const unsubscribes: (() => void)[] = [];

    chats.forEach((chatItem) => {
      if (chatItem.id === activeChatId) return;

      const msgQuery = query(
        collection(db, "chats", chatItem.id, "messages"),
        orderBy("timestamp", "desc"),
        limit(1)
      );
      const unsub = onSnapshot(msgQuery, (snap) => {
        if (!snap.empty) {
          const lastMsg = snap.docs[0].data();
          const seenBy: string[] = lastMsg.seenBy || [];
          if (lastMsg.senderId !== user.uid && !seenBy.includes(user.uid)) {
            setUnreadChats((prev) => new Set(prev).add(chatItem.id));
          }
        }
      });
      unsubscribes.push(unsub);
    });

    return () => unsubscribes.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatIds, activeChatId, user]);

  // Notify parent of unread state changes
  useEffect(() => {
    onUnreadChange?.(unreadChats.size > 0);
  }, [unreadChats, onUnreadChange]);

  // Mark as read when opening chat - using ref to avoid setState in effect
  const prevActiveChatRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeChatId && activeChatId !== prevActiveChatRef.current) {
      prevActiveChatRef.current = activeChatId;
      setUnreadChats((prev) => {
        if (!prev.has(activeChatId)) return prev;
        const next = new Set(prev);
        next.delete(activeChatId);
        return next;
      });
    }
  }, [activeChatId]);

  // Search users
  const handleSearch = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (!value || value.length < 2) {
        setShowSearch(false);
        setSearchResults([]);
        return;
      }
      searchTimeoutRef.current = setTimeout(async () => {
        const q = value.trim().toLowerCase();
        const results: (UserData & { id: string })[] = [];
        try {
          const emailSnap = await getDocs(
            query(collection(db, "users"), where("email", "==", q), limit(5))
          );
          emailSnap.docs.forEach((doc) => {
            if (doc.id !== user?.uid) results.push({ id: doc.id, ...(doc.data() as UserData) });
          });
          const usernameSnap = await getDocs(
            query(collection(db, "users"), where("username", "==", q), limit(5))
          );
          usernameSnap.docs.forEach((doc) => {
            if (doc.id !== user?.uid && !results.find((r) => r.id === doc.id)) {
              results.push({ id: doc.id, ...(doc.data() as UserData) });
            }
          });
        } catch (err) {
          console.error("Search error:", err);
        }
        setSearchResults(results);
        setShowSearch(true);
      }, 350);
    },
    [user]
  );

  const formatTime = (timestamp: Timestamp) => {
    if (!timestamp) return "";
    const date = timestamp.toDate();
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const dayMs = 86400000;
    if (diff < dayMs && now.getDate() === date.getDate()) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    if (diff < 7 * dayMs) {
      return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const getDisplayName = (chatItem: ChatListItem) => {
    if (chatItem.chat.type === "group") return chatItem.displayName;
    if (chatItem.otherUserId && userNames[chatItem.otherUserId]) {
      return userNames[chatItem.otherUserId].name || userNames[chatItem.otherUserId].username;
    }
    return chatItem.displayName;
  };

  const getInitial = (chatItem: ChatListItem) => {
    const name = getDisplayName(chatItem);
    return name.charAt(0).toUpperCase();
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h3>Chats</h3>
        <div className="sidebar-actions">
          <button className="btn-icon" onClick={() => document.getElementById("user-search-input")?.focus()} title="New Chat">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <button className="btn-icon btn-signout" onClick={onSignOut} title="Sign Out">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
      </div>

      <div className="search-container">
        <input
          id="user-search-input"
          type="text"
          placeholder="Search by username or email..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>

      {showSearch && (
        <div className="search-results active">
          {searchResults.length === 0 ? (
            <div className="search-no-results">No users found</div>
          ) : (
            searchResults.map((u) => (
              <div
                key={u.id}
                className="search-result-item"
                onClick={() => {
                  onOpenChat(u.id);
                  setSearchQuery("");
                  setShowSearch(false);
                }}
              >
                <div className="search-result-avatar">
                  {(u.name || u.username || "?").charAt(0).toUpperCase()}
                </div>
                <div className="search-result-info">
                  <div className="search-result-name">{u.name || "Unknown"}</div>
                  <div className="search-result-username">@{u.username}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <div className="chat-list">
        {chats.length === 0 ? (
          <div className="chat-list-empty">
            No conversations yet.
            <br />
            Search for users to start chatting.
          </div>
        ) : (
          chats.map((chatItem) => {
            const hasUnread = unreadChats.has(chatItem.id);
            const isOnline = chatItem.otherUserId ? onlineUsers[chatItem.otherUserId] : false;

            return (
              <div
                key={chatItem.id}
                className={`chat-list-item ${activeChatId === chatItem.id ? "active" : ""} ${hasUnread ? "has-unread" : ""}`}
                onClick={() => onOpenChat(chatItem.id)}
              >
                <div className="chat-list-avatar-wrapper">
                  <div className="chat-list-avatar">{getInitial(chatItem)}</div>
                  {isOnline && <div className="online-dot-avatar" />}
                </div>
                <div className="chat-list-info">
                  <div className="chat-list-name">{getDisplayName(chatItem)}</div>
                  <div className="chat-list-preview">
                    {chatItem.chat.lastMessageSender === user?.uid && chatItem.chat.lastMessage
                      ? `You: ${chatItem.chat.lastMessage}`
                      : chatItem.chat.lastMessage || ""}
                  </div>
                </div>
                <div className="chat-list-meta">
                  {chatItem.chat.lastMessageTime && (
                    <span className="chat-list-time">{formatTime(chatItem.chat.lastMessageTime)}</span>
                  )}
                  {hasUnread && <div className="unread-dot" />}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
