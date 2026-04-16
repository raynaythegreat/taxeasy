import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Mock Tauri APIs — not available in the test environment
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(null),
}));
