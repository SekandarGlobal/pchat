"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import {
  onAuthStateChanged,
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { ref, set, remove, onDisconnect } from "firebase/database";
import { auth, db, rtdb, googleProvider } from "./firebase";
import { UserData } from "./types";

interface AuthContextType {
  user: User | null;
  userData: UserData | null;
  loading: boolean;
  setupStep: "none" | "name" | "username" | "done";
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logOut: () => Promise<void>;
  saveName: (name: string) => Promise<void>;
  saveUsername: (username: string) => Promise<void>;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupStep, setSetupStep] = useState<
    "none" | "name" | "username" | "done"
  >("none");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const snap = await getDoc(doc(db, "users", firebaseUser.uid));
          if (snap.exists()) {
            const data = snap.data() as UserData;
            setUserData(data);
            if (data.name && data.username) {
              setSetupStep("done");
            } else if (data.name) {
              setSetupStep("username");
            } else {
              setSetupStep("name");
            }
          } else {
            setUserData(null);
            setSetupStep("name");
          }
        } catch {
          setSetupStep("name");
        }
      } else {
        setUserData(null);
        setSetupStep("none");
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const setupPresence = useCallback((uid: string) => {
    const onlineRef = ref(rtdb, `online/${uid}`);
    set(onlineRef, { online: true, lastSeen: Date.now() });
    onDisconnect(onlineRef).set({
      online: false,
      lastSeen: Date.now(),
    });
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    await createUserWithEmailAndPassword(auth, email, password);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const result = await signInWithPopup(auth, googleProvider);
    const cred = result as unknown as { additionalUserInfo?: { isNewUser: boolean } };
    if (cred.additionalUserInfo?.isNewUser) {
      const name = result.user.displayName || "";
      await setDoc(
        doc(db, "users", result.user.uid),
        {
          name,
          email: result.user.email,
          username: "",
          createdAt: new Date(),
        },
        { merge: true }
      );
    }
  }, []);

  const logOut = useCallback(async () => {
    if (auth.currentUser) {
      try {
        await remove(ref(rtdb, `online/${auth.currentUser.uid}`));
        await remove(ref(rtdb, `typing/${auth.currentUser.uid}`));
      } catch {
        // ignore cleanup errors
      }
    }
    await signOut(auth);
  }, []);

  const saveName = useCallback(async (name: string) => {
    if (!auth.currentUser) return;
    await setDoc(
      doc(db, "users", auth.currentUser.uid),
      {
        name,
        email: auth.currentUser.email,
        username: "",
        createdAt: new Date(),
      },
      { merge: true }
    );
    setUserData((prev) =>
      prev ? { ...prev, name } : { name, username: "", email: auth.currentUser?.email || "", createdAt: null as never }
    );
    setSetupStep("username");
  }, []);

  const saveUsername = useCallback(
    async (username: string) => {
      if (!auth.currentUser) return;
      await updateDoc(doc(db, "users", auth.currentUser.uid), { username });
      setUserData((prev) => (prev ? { ...prev, username } : null));
      setSetupStep("done");
      setupPresence(auth.currentUser.uid);
    },
    [setupPresence]
  );

  const refreshUserData = useCallback(async () => {
    if (!auth.currentUser) return;
    const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
    if (snap.exists()) {
      setUserData(snap.data() as UserData);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        userData,
        loading,
        setupStep,
        signIn,
        signUp,
        signInWithGoogle,
        logOut,
        saveName,
        saveUsername,
        refreshUserData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
