import axios, { AxiosError, AxiosInstance } from "axios";
import type {
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  ExpenseClaimRequest,
  ExpenseRecord,
  ManualDecisionRequest,
  ApiError,
} from "../types";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5050";

class ApiClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        "Content-Type": "application/json",
      },
    });

    this.client.interceptors.request.use((config) => {
      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }
      return config;
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError<ApiError>) => {
        if (error.response?.status === 401 || error.response?.status === 403) {
          this.clearToken();
          window.location.href = "/login";
        }
        return Promise.reject(error);
      }
    );
  }

  setToken(token: string | null) {
    this.token = token;
  }

  clearToken() {
    this.token = null;
  }

  async register(data: RegisterRequest): Promise<AuthResponse> {
    const response = await this.client.post<AuthResponse>("/auth/register", data);
    return response.data;
  }

  async login(data: LoginRequest): Promise<AuthResponse> {
    const response = await this.client.post<AuthResponse>("/auth/login", data);
    return response.data;
  }

  async submitExpense(data: ExpenseClaimRequest): Promise<{
    message: string;
    expenseId: string;
    correlationId: string;
    submittedAt: string;
    status: string;
    workflowVersion: string;
  }> {
    const response = await this.client.post("/expense", data);
    return response.data;
  }

  async getExpense(expenseId: string): Promise<ExpenseRecord> {
    const response = await this.client.get<ExpenseRecord>(`/expense/${expenseId}`);
    return response.data;
  }

  async getMyExpenses(employeeId: string, nextToken?: string): Promise<{
    expenses: ExpenseRecord[];
    count: number;
    employeeId: string;
    nextToken?: string;
  }> {
    const params = nextToken ? { nextToken } : {};
    const response = await this.client.get(`/expenses/employee/${employeeId}`, { params });
    return response.data;
  }

  async getPendingReviews(): Promise<ExpenseRecord[]> {
    const response = await this.client.get<{ expenses: ExpenseRecord[] }>("/expenses");
    const allExpenses = response.data.expenses;
    return allExpenses.filter(
      (e) => e.status === "NEEDS_MANUAL_REVIEW" || e.status === "PENDING_REVIEW"
    );
  }

  async submitManualDecision(
    expenseId: string,
    data: ManualDecisionRequest
  ): Promise<{ message: string; expense: ExpenseRecord }> {
    const response = await this.client.post(`/expenses/${expenseId}/manual-decision`, data);
    return response.data;
  }
}

export const apiClient = new ApiClient();
