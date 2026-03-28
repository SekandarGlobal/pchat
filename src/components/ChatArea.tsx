"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  doc,
  getDoc,
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  arrayUnion,
  Timestamp,
  serverTimestamp,
  where,
  getDocs,
  limit,
} from "firebase/firestore";
import {
  ref,
  onValue,
  set,
  remove,
} from "firebase/database";
import { db, rtdb } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { ChatData, MessageData, UserData, TypingData, PresenceData } from "@/lib/types";

interface ChatAreaProps {
  chatId: string | null;
  onBack?: () => void;
}

function LinkifiedText({ text }: { text: string }) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return (
    <>
      {parts.map((part, i) => {
        if (urlRegex.test(part)) {
          return (
            <a key={i} className="message-link" href={part} target="_blank" rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}>
              {part}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

export default function ChatArea({ chatId, onBack }: ChatAreaProps) {
  const { user, userData } = useAuth();
  const [chatData, setChatData] = useState<ChatData | null>(null);
  const [messages, setMessages] = useState<(MessageData & { id: string })[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [otherUserName, setOtherUserName] = useState("");
  const [otherUserOnline, setOtherUserOnline] = useState(false);
  const [editingMessage, setEditingMessage] = useState<{ id: string; text: string } | null>(null);
  const [editText, setEditText] = useState("");
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number; isSent: boolean } | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberResults, setMemberResults] = useState<(UserData & { id: string })[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isNearBottomRef = useRef(true);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkNearBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    isNearBottomRef.current = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
  }, []);

  const forceScrollBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const prevChatIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!chatId || !user) return;
    let cleanup: (() => void) | undefined;
    const loadChat = async () => {
      if (prevChatIdRef.current !== chatId) {
        prevChatIdRef.current = chatId;
        setOtherUserName("");
        setOtherUserOnline(false);
        setChatData(null);
      }
      const chatSnap = await getDoc(doc(db, "chats", chatId));
      if (!chatSnap.exists()) return;
      const data = chatSnap.data() as ChatData;
      setChatData(data);
      if (data.type === "direct") {
        const otherId = data.participants.find((id) => id !== user.uid);
        if (otherId) {
          const userSnap = await getDoc(doc(db, "users", otherId));
          if (userSnap.exists()) {
            const udata = userSnap.data() as UserData;
            setOtherUserName(udata.name || udata.username);
            cleanup = onValue(ref(rtdb, `online/${otherId}`), (snap) => {
              const val = snap.val() as PresenceData | null;
              setOtherUserOnline(val?.online || false);
            });
          }
        }
      } else {
        setOtherUserName(data.name || "Group");
      }
    };
    loadChat();
    return () => { cleanup?.(); };
  }, [chatId, user]);

  useEffect(() => {
    if (!chatId || !user) return;
    const q = query(collection(db, "chats", chatId, "messages"), orderBy("timestamp", "asc"));
    return onSnapshot(q, async (snapshot) => {
      const msgs: (MessageData & { id: string })[] = [];
      for (const msgDoc of snapshot.docs) {
        const msg = msgDoc.data() as MessageData;
        const deletedFor = msg.deletedFor || [];
        if (!deletedFor.includes(user.uid)) {
          msgs.push({ id: msgDoc.id, ...msg });
          if (msg.senderId !== user.uid) {
            const seenBy = msg.seenBy || [];
            if (!seenBy.includes(user.uid)) {
              await updateDoc(doc(db, "chats", chatId, "messages", msgDoc.id), {
                seenBy: arrayUnion(user.uid),
              });
            }
          }
        }
      }
      setMessages(msgs);
      setTimeout(() => forceScrollBottom(), 50);
    });
  }, [chatId, user, forceScrollBottom]);

  useEffect(() => {
    if (!chatId) return;
    return onValue(ref(rtdb, "typing"), (snap) => {
      if (!snap.exists()) { setTypingUsers([]); return; }
      const names: string[] = [];
      snap.forEach((child) => {
        const val = child.val() as TypingData;
        if (val.chatId === chatId && child.key !== user?.uid) names.push(val.name);
      });
      setTypingUsers(names);
    });
  }, [chatId, user]);

  const handleTyping = useCallback(() => {
    if (!chatId || !user || !userData) return;
    set(ref(rtdb, `typing/${user.uid}`), {
      chatId, name: userData.name || userData.username, timestamp: Date.now(),
    });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      if (user) remove(ref(rtdb, `typing/${user.uid}`));
    }, 3000);
  }, [chatId, user, userData]);

  const sendMessage = useCallback(async () => {
    if (!messageInput.trim() || !chatId || !user || !userData) return;
    const text = messageInput.trim();
    setMessageInput("");
    await addDoc(collection(db, "chats", chatId, "messages"), {
      senderId: user.uid, senderName: userData.name || userData.username,
      text, timestamp: serverTimestamp(), edited: false, deletedFor: [], seenBy: [],
    });
    await updateDoc(doc(db, "chats", chatId), {
      lastMessage: text, lastMessageTime: serverTimestamp(), lastMessageSender: user.uid,
    });
    remove(ref(rtdb, `typing/${user.uid}`));
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    setTimeout(() => forceScrollBottom(), 50);
  }, [messageInput, chatId, user, userData, forceScrollBottom]);

  const saveEdit = useCallback(async () => {
    if (!editingMessage || !editText.trim() || !chatId) return;
    await updateDoc(doc(db, "chats", chatId, "messages", editingMessage.id), {
      text: editText.trim(), edited: true, editedAt: serverTimestamp(),
    });
    setEditingMessage(null);
    setEditText("");
  }, [editingMessage, editText, chatId]);

  const deleteForMe = useCallback(async (msgId: string) => {
    if (!chatId || !user) return;
    await updateDoc(doc(db, "chats", chatId, "messages", msgId), { deletedFor: arrayUnion(user.uid) });
  }, [chatId, user]);

  const deleteForEveryone = useCallback(async (msgId: string) => {
    if (!chatId || !chatData) return;
    await updateDoc(doc(db, "chats", chatId, "messages", msgId), { deletedFor: chatData.participants });
  }, [chatId, chatData]);

  const copyText = useCallback((text: string, msgId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(msgId);
    setTimeout(() => setCopiedId(null), 1500);
  }, []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, msgId: string, isSent: boolean) => {
      e.preventDefault();
      setContextMenu({ id: msgId, x: Math.min(e.clientX, window.innerWidth - 200), y: Math.min(e.clientY, window.innerHeight - 250), isSent });
    }, []
  );

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleTouchStart = useCallback((msgId: string, isSent: boolean) => {
    longPressTimer.current = setTimeout(() => {
      setContextMenu({ id: msgId, x: 60, y: window.innerHeight / 2 - 100, isSent });
    }, 500);
  }, []);
  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const handleMemberSearch = useCallback((value: string) => {
    setMemberSearch(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!value || value.length < 2) { setMemberResults([]); return; }
    searchTimeoutRef.current = setTimeout(async () => {
      const q = value.trim().toLowerCase();
      const results: (UserData & { id: string })[] = [];
      try {
        const existing = chatData?.participants || [];
        const emailSnap = await getDocs(query(collection(db, "users"), where("email", "==", q), limit(5)));
        emailSnap.docs.forEach((d) => {
          if (!existing.includes(d.id)) results.push({ id: d.id, ...(d.data() as UserData) });
        });
        const userSnap = await getDocs(query(collection(db, "users"), where("username", "==", q), limit(5)));
        userSnap.docs.forEach((d) => {
          if (!existing.includes(d.id) && !results.find((r) => r.id === d.id))
            results.push({ id: d.id, ...(d.data() as UserData) });
        });
      } catch { /* ignore */ }
      setMemberResults(results);
    }, 350);
  }, [chatData]);

  const addMember = useCallback(async (userId: string) => {
    if (!chatId) return;
    await updateDoc(doc(db, "chats", chatId), { participants: arrayUnion(userId) });
    setChatData((prev) => prev ? { ...prev, participants: [...prev.participants, userId] } : null);
    setMemberSearch(""); setMemberResults([]); setShowAddMember(false);
  }, [chatId]);

  const formatMessageTime = (timestamp: Timestamp | null) => {
    if (!timestamp) return "";
    const date = typeof timestamp === "object" && "toDate" in timestamp
      ? (timestamp as Timestamp).toDate()
      : new Date(timestamp as unknown as number);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // No chat selected - show ZCHAT branding
  if (!chatId) {
    return (
      <div className="chat-main">
        <div className="no-chat-selected">
          <div className="zchat-logo">ZCHAT</div>
          <p className="zchat-subtitle">Fast. Secure. Simple.</p>
          <p className="zchat-hint">Select a conversation or tap + to start chatting</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-main">
      <div className="chat-active">
        {/* Chat Header - always shows back button */}
        <div className="chat-header">
          <button className="btn-back-sidebar" onClick={onBack} style={{ display: "flex" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="chat-header-info">
            <h3>{otherUserName || "Chat"}</h3>
            {chatData?.type === "direct" ? (
              <span className={`status-text ${otherUserOnline ? "online" : ""}`}>
                {otherUserOnline ? "Online" : "Offline"}
              </span>
            ) : (
              <span className="status-text">{chatData?.participants.length} members</span>
            )}
          </div>
          {chatData?.type === "group" && (
            <div className="chat-header-actions">
              <button className="btn-icon" onClick={() => setShowAddMember(!showAddMember)} title="Add Member">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                  <circle cx="8.5" cy="7" r="4" />
                  <path d="M20 8v6M23 11h-6" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Add member panel */}
        {showAddMember && chatData?.type === "group" && (
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-color)", background: "var(--bg-secondary)" }}>
            <input type="text" placeholder="Search user to add..." value={memberSearch}
              onChange={(e) => handleMemberSearch(e.target.value)}
              style={{
                width: "100%", padding: "10px 14px", border: "1px solid var(--border-color)",
                borderRadius: "var(--radius-full)", background: "var(--bg-tertiary)",
                color: "var(--text-primary)", fontSize: 14, outline: "none", fontFamily: "inherit",
              }} />
            {memberResults.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {memberResults.map((u) => (
                  <div key={u.id} className="search-result-item" onClick={() => addMember(u.id)}>
                    <div className="search-result-avatar">{(u.name || u.username || "?").charAt(0).toUpperCase()}</div>
                    <div className="search-result-info">
                      <div className="search-result-name">{u.name}</div>
                      <div className="search-result-username">@{u.username}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        <div className="messages-container" ref={messagesContainerRef} onScroll={checkNearBottom}>
          {messages.map((msg) => {
            const isSent = msg.senderId === user?.uid;
            const seenBy = (msg.seenBy || []).filter((id) => id !== user?.uid);
            let seenStatus: string | null = null;
            if (isSent) {
              if (chatData?.type === "group") {
                const others = chatData.participants.filter((id) => id !== user?.uid);
                if (seenBy.length === others.length && others.length > 0) seenStatus = "Seen by all";
                else if (seenBy.length > 0) seenStatus = `Seen by ${seenBy.length}`;
              } else {
                if (seenBy.length > 0) seenStatus = "Seen";
              }
            }
            return (
              <div key={msg.id} className={`message-wrapper ${isSent ? "sent" : "received"}`}
                onContextMenu={(e) => handleContextMenu(e, msg.id, isSent)}
                onTouchStart={() => handleTouchStart(msg.id, isSent)}
                onTouchEnd={handleTouchEnd} onTouchCancel={handleTouchEnd}>
                {chatData?.type === "group" && !isSent && (
                  <div className="message-sender-name">{msg.senderName}</div>
                )}
                <div className="message-bubble"><LinkifiedText text={msg.text} /></div>
                <div className="message-meta">
                  {msg.timestamp && <span className="message-time">{formatMessageTime(msg.timestamp)}</span>}
                  {msg.edited && <span className="message-edited">edited</span>}
                  {seenStatus && (
                    <span className="message-seen">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
                      {seenStatus}
                    </span>
                  )}
                </div>
                <div className="message-actions-row">
                  <button className="message-action-btn-sm" onClick={() => copyText(msg.text, msg.id)} title="Copy">
                    {copiedId === msg.id ? "Copied!" : "Copy"}
                  </button>
                  {msg.text.match(/https?:\/\//) && (
                    <button className="message-action-btn-sm" onClick={() => {
                      const url = msg.text.match(/(https?:\/\/[^\s]+)/)?.[0];
                      if (url) window.open(url, "_blank");
                    }} title="Open link">Open</button>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <div className="typing-indicator">
            <span className="typing-dots"><span /><span /><span /></span>
            {typingUsers.join(", ")}{typingUsers.length === 1 ? " is" : " are"} typing...
          </div>
        )}

        {/* Message Input */}
        <div className="message-input-area">
          <input type="text" placeholder="Type a message..." value={messageInput}
            onChange={(e) => { setMessageInput(e.target.value); handleTyping(); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} />
          <button className="btn-send" onClick={sendMessage} disabled={!messageInput.trim()}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Edit Modal */}
      {editingMessage && (
        <div className="modal" onClick={() => setEditingMessage(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Edit Message</h3>
            <div className="form-group">
              <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} autoFocus />
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setEditingMessage(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEdit}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div className="context-menu"
          style={{ position: "fixed", top: contextMenu.y, left: contextMenu.x, zIndex: 2000 }}
          onClick={(e) => e.stopPropagation()}>
          <button className="context-menu-item" onClick={() => {
            const msg = messages.find((m) => m.id === contextMenu.id);
            if (msg) copyText(msg.text, msg.id);
            setContextMenu(null);
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
            Copy
          </button>
          {contextMenu.isSent && (
            <button className="context-menu-item" onClick={() => {
              const msg = messages.find((m) => m.id === contextMenu.id);
              if (msg) { setEditingMessage({ id: msg.id, text: msg.text }); setEditText(msg.text); }
              setContextMenu(null);
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit
            </button>
          )}
          <div className="context-menu-divider" />
          <button className="context-menu-item" onClick={() => { deleteForMe(contextMenu.id); setContextMenu(null); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
            Delete for me
          </button>
          {contextMenu.isSent && (
            <button className="context-menu-item context-menu-item-danger" onClick={() => {
              deleteForEveryone(contextMenu.id); setContextMenu(null);
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /><path d="M10 11v6M14 11v6" />
              </svg>
              Delete for everyone
            </button>
          )}
        </div>
      )}
    </div>
  );
}
