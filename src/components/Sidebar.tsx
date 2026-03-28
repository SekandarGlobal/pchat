"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  limit,
  getDocs,
  Timestamp,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
  deleteDoc,
} from "firebase/firestore";
import { ref, onValue } from "firebase/database";
import { db, rtdb } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { ChatData, UserData, PresenceData, ChatRequest } from "@/lib/types";

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
  onShowNewChat?: () => void;
}

export default function Sidebar({ activeChatId, onOpenChat, onSignOut, onUnreadChange, onShowNewChat }: SidebarProps) {
  const { user } = useAuth();
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [userNames, setUserNames] = useState<Record<string, UserData>>({});
  const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>({});
  const [unreadChats, setUnreadChats] = useState<Set<string>>(new Set());
  const [chatRequests, setChatRequests] = useState<ChatRequest[]>([]);
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

      snapshot.docs.forEach((d) => {
        const chat = d.data() as ChatData;
        let displayName = "Chat";
        let initial = "?";
        let otherUserId: string | null = null;

        if (chat.type === "group") {
          displayName = chat.name || "Group";
          initial = displayName.charAt(0).toUpperCase();
        } else {
          otherUserId = chat.participants.find((id) => id !== user.uid) || null;
          if (otherUserId) userIds.add(otherUserId);
        }

        chatList.push({ id: d.id, chat, displayName, initial, otherUserId, hasUnread: false });
      });

      userIds.forEach((uid) => {
        if (!fetchedUserIdsRef.current.has(uid)) {
          fetchedUserIdsRef.current.add(uid);
          getDocs(query(collection(db, "users"), where("__name__", "==", uid))).then((snap) => {
            if (!snap.empty) {
              setUserNames((prev) => ({ ...prev, [uid]: snap.docs[0].data() as UserData }));
            }
          });
        }
      });

      setChats(chatList);
    });
  }, [user]);

  // Listen for incoming chat requests
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "chatRequests"),
      where("to", "==", user.uid),
      where("status", "==", "pending")
    );
    return onSnapshot(q, (snapshot) => {
      const requests: ChatRequest[] = [];
      snapshot.docs.forEach((d) => {
        requests.push({ id: d.id, ...(d.data() as Omit<ChatRequest, "id">) });
      });
      setChatRequests(requests);
    });
  }, [user]);

  const acceptRequest = useCallback(async (req: ChatRequest) => {
    if (!req.id || !user) return;
    // Update request status
    await updateDoc(doc(db, "chatRequests", req.id), { status: "accepted" });
    // Create the chat
    await addDoc(collection(db, "chats"), {
      participants: [user.uid, req.from],
      type: "direct",
      createdBy: req.from,
      createdAt: serverTimestamp(),
      lastMessage: "",
      lastMessageTime: serverTimestamp(),
    });
  }, [user]);

  const declineRequest = useCallback(async (req: ChatRequest) => {
    if (!req.id) return;
    await updateDoc(doc(db, "chatRequests", req.id), { status: "declined" });
  }, []);

  const deleteRequest = useCallback(async (req: ChatRequest) => {
    if (!req.id) return;
    await deleteDoc(doc(db, "chatRequests", req.id));
  }, []);

  const chatOtherUserIds = chats.map((c) => c.otherUserId).filter(Boolean).join(",");
  const chatIds = chats.map((c) => c.id).join(",");

  // Listen for online status
  useEffect(() => {
    const unsubs: (() => void)[] = [];
    chats.forEach((chat) => {
      if (chat.otherUserId) {
        const unsub = onValue(ref(rtdb, `online/${chat.otherUserId}`), (snap) => {
          const val = snap.val() as PresenceData | null;
          setOnlineUsers((prev) => ({ ...prev, [chat.otherUserId!]: val?.online || false }));
        });
        unsubs.push(unsub);
      }
    });
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatOtherUserIds]);

  // Listen for unread messages
  useEffect(() => {
    if (!user) return;
    const unsubs: (() => void)[] = [];
    chats.forEach((chatItem) => {
      if (chatItem.id === activeChatId) return;
      const msgQuery = query(
        collection(db, "chats", chatItem.id, "messages"),
        orderBy("timestamp", "desc"), limit(1)
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
      unsubs.push(unsub);
    });
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatIds, activeChatId, user]);

  useEffect(() => { onUnreadChange?.(unreadChats.size > 0); }, [unreadChats, onUnreadChange]);

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

  const formatTime = (timestamp: Timestamp) => {
    if (!timestamp) return "";
    const date = timestamp.toDate();
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 86400000 && now.getDate() === date.getDate())
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (diff < 7 * 86400000)
      return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const getDisplayName = (chatItem: ChatListItem) => {
    if (chatItem.chat.type === "group") return chatItem.displayName;
    if (chatItem.otherUserId && userNames[chatItem.otherUserId])
      return userNames[chatItem.otherUserId].name || userNames[chatItem.otherUserId].username;
    return chatItem.displayName;
  };

  const getInitial = (chatItem: ChatListItem) => getDisplayName(chatItem).charAt(0).toUpperCase();

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h3 className="sidebar-title">ZCHAT</h3>
        <div className="sidebar-actions">
          <button className="btn-icon" onClick={onShowNewChat} title="New Chat">
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

      {/* Chat Requests */}
      {chatRequests.length > 0 && (
        <div className="requests-section">
          <div className="requests-title">Chat Requests</div>
          {chatRequests.map((req) => (
            <div key={req.id} className="request-item">
              <div className="request-avatar">
                {(req.fromName || req.fromUsername || "?").charAt(0).toUpperCase()}
              </div>
              <div className="request-info">
                <div className="request-name">{req.fromName}</div>
                <div className="request-username">@{req.fromUsername}</div>
              </div>
              <div className="request-actions">
                <button className="request-btn request-btn-accept" onClick={() => acceptRequest(req)} title="Accept">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </button>
                <button className="request-btn request-btn-decline" onClick={() => declineRequest(req)} title="Decline">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Chat List */}
      <div className="chat-list">
        {chats.length === 0 && chatRequests.length === 0 ? (
          <div className="chat-list-empty">
            No conversations yet.
            <br />
            Tap + to find someone to chat with.
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
