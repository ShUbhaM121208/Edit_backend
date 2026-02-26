/**
 * Test setup — runs before each test file.
 * Sets env vars for testing so config/env.ts doesn't throw.
 */
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.JWT_SECRET = "test-jwt-secret-for-unit-tests";
process.env.PORT = "3099";
process.env.NODE_ENV = "test";
process.env.FRONTEND_URL = "http://localhost:5173";
