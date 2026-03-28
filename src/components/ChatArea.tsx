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
  onStartChat: (userId: string) => Promise<string | void>;
}

export default function ChatArea({ chatId, onStartChat }: ChatAreaProps) {
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isNearBottomRef = useRef(true);

  // Check if user is near bottom of messages
  const checkNearBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const threshold = 100;
    isNearBottomRef.current =
      container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  }, []);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior });
    }
  }, []);

  // Force scroll to bottom
  const forceScrollBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Load chat data
  useEffect(() => {
    if (!chatId || !user) return;

    const loadChat = async () => {
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

            // Listen for presence
            const unsub = onValue(ref(rtdb, `online/${otherId}`), (snap) => {
              const val = snap.val() as PresenceData | null;
              setOtherUserOnline(val?.online || false);
            });
            return () => unsub();
          }
        }
      } else {
        setOtherUserName(data.name || "Group");
      }
    };
    const cleanup = loadChat();
    return () => {
      cleanup?.then((fn) => fn?.());
    };
  }, [chatId, user]);

  // Listen for messages
  useEffect(() => {
    if (!chatId || !user) return;

    const q = query(
      collection(db, "chats", chatId, "messages"),
      orderBy("timestamp", "asc")
    );

    return onSnapshot(q, async (snapshot) => {
      const msgs: (MessageData & { id: string })[] = [];

      for (const msgDoc of snapshot.docs) {
        const msg = msgDoc.data() as MessageData;
        const deletedFor = msg.deletedFor || [];
        if (!deletedFor.includes(user.uid)) {
          msgs.push({ id: msgDoc.id, ...msg });

          // Mark messages as seen
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

      // Scroll to bottom on new messages
      setTimeout(() => forceScrollBottom(), 50);
    });
  }, [chatId, user, forceScrollBottom]);

  // Listen for typing
  useEffect(() => {
    if (!chatId) return;
    return onValue(ref(rtdb, "typing"), (snap) => {
      if (!snap.exists()) {
        setTypingUsers([]);
        return;
      }
      const names: string[] = [];
      snap.forEach((child) => {
        const val = child.val() as TypingData;
        if (val.chatId === chatId && child.key !== user?.uid) {
          names.push(val.name);
        }
      });
      setTypingUsers(names);
    });
  }, [chatId, user]);

  // Handle typing
  const handleTyping = useCallback(() => {
    if (!chatId || !user || !userData) return;
    set(ref(rtdb, `typing/${user.uid}`), {
      chatId,
      name: userData.name || userData.username,
      timestamp: Date.now(),
    });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      if (user) remove(ref(rtdb, `typing/${user.uid}`));
    }, 3000);
  }, [chatId, user, userData]);

  // Send message
  const sendMessage = useCallback(async () => {
    if (!messageInput.trim() || !chatId || !user || !userData) return;
    const text = messageInput.trim();
    setMessageInput("");

    await addDoc(collection(db, "chats", chatId, "messages"), {
      senderId: user.uid,
      senderName: userData.name || userData.username,
      text,
      timestamp: serverTimestamp(),
      edited: false,
      deletedFor: [],
      seenBy: [],
    });

    await updateDoc(doc(db, "chats", chatId), {
      lastMessage: text,
      lastMessageTime: serverTimestamp(),
      lastMessageSender: user.uid,
    });

    // Clear typing
    remove(ref(rtdb, `typing/${user.uid}`));
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    // Force scroll
    setTimeout(() => forceScrollBottom(), 50);
  }, [messageInput, chatId, user, userData, forceScrollBottom]);

  // Edit message
  const saveEdit = useCallback(async () => {
    if (!editingMessage || !editText.trim() || !chatId) return;
    await updateDoc(doc(db, "chats", chatId, "messages", editingMessage.id), {
      text: editText.trim(),
      edited: true,
      editedAt: serverTimestamp(),
    });
    setEditingMessage(null);
    setEditText("");
  }, [editingMessage, editText, chatId]);

  // Delete message
  const deleteMessage = useCallback(
    async (msgId: string) => {
      if (!chatId || !user) return;
      await updateDoc(doc(db, "chats", chatId, "messages", msgId), {
        deletedFor: arrayUnion(user.uid),
      });
    },
    [chatId, user]
  );

  // Context menu
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, msgId: string, isSent: boolean) => {
      e.preventDefault();
      setContextMenu({ id: msgId, x: e.clientX, y: e.clientY, isSent });
    },
    []
  );

  // Close context menu on click
  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const formatMessageTime = (timestamp: Timestamp | null) => {
    if (!timestamp) return "";
    const date = typeof timestamp === 'object' && 'toDate' in timestamp ? (timestamp as Timestamp).toDate() : new Date(timestamp as unknown as number);
    return (
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) +
      " " +
      date.toLocaleDateString([], { month: "short", day: "numeric" })
    );
  };

  const getLastSeenStatus = (msg: MessageData & { id: string }) => {
    if (msg.senderId !== user?.uid) return null;
    const seenBy = msg.seenBy || [];
    if (chatData?.type === "group") {
      const otherParticipants = chatData.participants.filter(
        (id) => id !== user?.uid
      );
      const seenByOthers = seenBy.filter((id) => id !== user?.uid);
      if (seenByOthers.length === otherParticipants.length && otherParticipants.length > 0) {
        return "Seen by all";
      }
      if (seenByOthers.length > 0) {
        return `Seen by ${seenByOthers.length}`;
      }
    } else {
      if (seenBy.length > 0) {
        return "Seen";
      }
    }
    return null;
  };

  if (!chatId) {
    return (
      <div className="chat-main">
        <div className="no-chat-selected">
          <div className="no-chat-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          </div>
          <h3>Welcome to ChatApp</h3>
          <p>Search for users or select a chat to start messaging</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-main">
      <div className="chat-active">
        {/* Chat Header */}
        <div className="chat-header">
          <button
            className="btn-back-sidebar"
            onClick={() => {
              /* handled by parent */
            }}
          >
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
              <span className="status-text">
                {chatData?.participants.length} members
              </span>
            )}
          </div>
        </div>

        {/* Messages */}
        <div
          className="messages-container"
          ref={messagesContainerRef}
          onScroll={checkNearBottom}
        >
          {messages.map((msg) => {
            const isSent = msg.senderId === user?.uid;
            const seenStatus = getLastSeenStatus(msg);

            return (
              <div
                key={msg.id}
                className={`message-wrapper ${isSent ? "sent" : "received"}`}
                onContextMenu={(e) => handleContextMenu(e, msg.id, isSent)}
              >
                {chatData?.type === "group" && !isSent && (
                  <div className="message-sender-name">{msg.senderName}</div>
                )}
                <div className="message-bubble">
                  {msg.text}
                </div>
                <div className="message-meta">
                  {msg.timestamp && (
                    <span className="message-time">{formatMessageTime(msg.timestamp)}</span>
                  )}
                  {msg.edited && <span className="message-edited">edited</span>}
                  {seenStatus && (
                    <span className="message-seen">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      {seenStatus}
                    </span>
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
            <span className="typing-dots">
              <span /><span /><span />
            </span>
            {typingUsers.join(", ")}
            {typingUsers.length === 1 ? " is" : " are"} typing...
          </div>
        )}

        {/* Message Input - Fixed at bottom */}
        <div className="message-input-area">
          <input
            type="text"
            placeholder="Type a message..."
            value={messageInput}
            onChange={(e) => {
              setMessageInput(e.target.value);
              handleTyping();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
          />
          <button
            className="btn-send"
            onClick={sendMessage}
            disabled={!messageInput.trim()}
          >
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
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={3}
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setEditingMessage(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={saveEdit}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{
            position: "fixed",
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 2000,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.isSent && (
            <>
              <button
                className="context-menu-item"
                onClick={() => {
                  const msg = messages.find((m) => m.id === contextMenu.id);
                  if (msg) {
                    setEditingMessage({ id: msg.id, text: msg.text });
                    setEditText(msg.text);
                  }
                  setContextMenu(null);
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Edit
              </button>
              <button
                className="context-menu-item context-menu-item-danger"
                onClick={() => {
                  deleteMessage(contextMenu.id);
                  setContextMenu(null);
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
                Delete
              </button>
            </>
          )}
          {!contextMenu.isSent && (
            <button
              className="context-menu-item"
              onClick={() => {
                deleteMessage(contextMenu.id);
                setContextMenu(null);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
              Delete for me
            </button>
          )}
        </div>
      )}
    </div>
  );
}
