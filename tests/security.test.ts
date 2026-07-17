import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("browser security policy", () => {
  it("leaves Astro hydration scripts to the build-generated hash policy", () => {
    const root = resolve(import.meta.dirname, "..");
    const headers = readFileSync(resolve(root, "public/_headers"), "utf8");
    const config = readFileSync(resolve(root, "astro.config.mjs"), "utf8");

    expect(headers).toContain("Content-Security-Policy: frame-ancestors 'none'");
    expect(headers).not.toMatch(/script-src/i);
    expect(config).toMatch(/security:\s*{[\s\S]*csp:\s*{/);
  });
});
