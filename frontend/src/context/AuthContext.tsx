import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { User, LoginRequest, RegisterRequest } from "../types";
import { apiClient } from "../services/api";

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // In-memory only - no persistence
    // Auth state is lost on page refresh per security requirement
    setIsLoading(false);
  }, []);

  const login = async (data: LoginRequest) => {
    const response = await apiClient.login(data);
    setToken(response.token);
    setUser(response.user);
    apiClient.setToken(response.token);
    // In-memory only - no browser storage
  };

  const register = async (data: RegisterRequest) => {
    const response = await apiClient.register(data);
    setToken(response.token);
    setUser(response.user);
    apiClient.setToken(response.token);
    // In-memory only - no browser storage
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    apiClient.clearToken();
    navigate("/login");
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
