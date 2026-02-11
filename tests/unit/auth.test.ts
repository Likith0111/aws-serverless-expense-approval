import { createUser, getUserByEmail, getUserById, emailExists, resetInMemoryUsers } from "../../src/utils/users-dynamo";

describe("Auth utilities", () => {
  beforeEach(() => resetInMemoryUsers());

  describe("createUser()", () => {
    it("should create a user", async () => {
      const user = {
        userId: "user-001",
        email: "test@example.com",
        passwordHash: "hashed",
        role: "EMPLOYEE" as const,
        employeeId: "EMP-001",
        createdAt: new Date().toISOString(),
      };
      await createUser(user);
      const retrieved = await getUserById("user-001");
      expect(retrieved).not.toBeNull();
      expect(retrieved?.email).toBe("test@example.com");
    });

    it("should throw if user already exists", async () => {
      const user = {
        userId: "user-001",
        email: "test@example.com",
        passwordHash: "hashed",
        role: "EMPLOYEE" as const,
        createdAt: new Date().toISOString(),
      };
      await createUser(user);
      await expect(createUser(user)).rejects.toThrow("User already exists");
    });
  });

  describe("getUserByEmail()", () => {
    it("should find user by email", async () => {
      await createUser({
        userId: "user-001",
        email: "test@example.com",
        passwordHash: "hashed",
        role: "EMPLOYEE",
        createdAt: new Date().toISOString(),
      });
      const user = await getUserByEmail("test@example.com");
      expect(user).not.toBeNull();
      expect(user?.userId).toBe("user-001");
    });

    it("should be case-insensitive", async () => {
      await createUser({
        userId: "user-001",
        email: "Test@Example.com",
        passwordHash: "hashed",
        role: "EMPLOYEE",
        createdAt: new Date().toISOString(),
      });
      const user = await getUserByEmail("test@example.com");
      expect(user).not.toBeNull();
    });

    it("should return null for non-existent email", async () => {
      const user = await getUserByEmail("nonexistent@example.com");
      expect(user).toBeNull();
    });
  });

  describe("emailExists()", () => {
    it("should return true if email exists", async () => {
      await createUser({
        userId: "user-001",
        email: "test@example.com",
        passwordHash: "hashed",
        role: "EMPLOYEE",
        createdAt: new Date().toISOString(),
      });
      expect(await emailExists("test@example.com")).toBe(true);
    });

    it("should return false if email does not exist", async () => {
      expect(await emailExists("nonexistent@example.com")).toBe(false);
    });
  });
});
