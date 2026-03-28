import { Timestamp } from "firebase/firestore";

export interface UserData {
  name: string;
  username: string;
  email: string;
  createdAt: Timestamp;
}

export interface ChatData {
  participants: string[];
  type: "direct" | "group";
  name?: string;
  createdBy: string;
  createdAt: Timestamp;
  lastMessage: string;
  lastMessageTime: Timestamp;
  lastMessageSender?: string;
  lastRead?: Record<string, Timestamp>;
}

export interface MessageData {
  senderId: string;
  senderName: string;
  text: string;
  timestamp: Timestamp;
  edited: boolean;
  editedAt?: Timestamp;
  deletedFor: string[];
  seenBy?: string[];
}

export interface PresenceData {
  online: boolean;
  lastSeen: number;
}

export interface TypingData {
  chatId: string;
  name: string;
  timestamp: number;
}

export interface ChatRequest {
  id?: string;
  from: string;
  fromName: string;
  fromUsername: string;
  to: string;
  status: "pending" | "accepted" | "declined";
  createdAt: Timestamp;
}
