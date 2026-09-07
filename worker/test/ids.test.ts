import { describe, it, expect } from "vitest";
import { generateOrderPublicId, generateLinkCode, isValidUuid, normalizeMojangUuid } from "../src/lib/ids";

describe("ids", () => {
  it("generateOrderPublicId produces unique opaque ids with the ord_ prefix", () => {
    const a = generateOrderPublicId();
    const b = generateOrderPublicId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^ord_[A-Z2-9]{20}$/);
  });

  it("generateLinkCode produces a 6-character code without ambiguous characters", () => {
    const code = generateLinkCode();
    expect(code).toHaveLength(6);
    expect(code).not.toMatch(/[01OI]/);
  });

  it("isValidUuid accepts real UUID format and rejects garbage", () => {
    expect(isValidUuid("069a79f4-44e9-4726-a5be-fca90e38aaf5")).toBe(true);
    expect(isValidUuid("not-a-uuid")).toBe(false);
    expect(isValidUuid("'; DROP TABLE orders; --")).toBe(false);
  });

  it("normalizeMojangUuid adds dashes to a raw 32-char Mojang uuid", () => {
    expect(normalizeMojangUuid("069a79f444e94726a5befca90e38aaf5")).toBe("069a79f4-44e9-4726-a5be-fca90e38aaf5");
  });

  it("normalizeMojangUuid throws on an unexpected length", () => {
    expect(() => normalizeMojangUuid("short")).toThrow();
  });
});
