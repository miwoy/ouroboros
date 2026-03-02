/**
 * 搜索引擎工厂函数单元测试
 */

import { describe, it, expect, vi } from "vitest";
import { createSearchProvider } from "../../src/search/index.js";

const mockFetch = vi.fn() as unknown as typeof globalThis.fetch;

describe("createSearchProvider", () => {
  it("provider=bing 应创建 Bing Provider", () => {
    const provider = createSearchProvider({ provider: "bing", fetchFn: mockFetch });
    expect(provider.name).toBe("bing");
  });

  it("provider=brave 应创建 Brave Provider", () => {
    const provider = createSearchProvider({
      provider: "brave",
      apiKey: "test-key",
      fetchFn: mockFetch,
    });
    expect(provider.name).toBe("brave");
  });

  it("provider=brave 缺少 apiKey 应抛出异常", () => {
    expect(() =>
      createSearchProvider({ provider: "brave", fetchFn: mockFetch }),
    ).toThrow("Brave 搜索需要 apiKey 配置");
  });

  it("不支持的 provider 应抛出异常", () => {
    expect(() =>
      createSearchProvider({
        provider: "unknown" as "bing",
        fetchFn: mockFetch,
      }),
    ).toThrow("不支持的搜索引擎");
  });
});
