/**
 * ouroboros doctor — 环境诊断
 *
 * 检查项目：
 *  1. Node.js 版本（≥ 20）
 *  2. 配置文件是否存在且有效
 *  3. 用户数据目录（~/.ouroboros/）
 *  4. OAuth 认证状态
 *  5. 提供商连通性（可选）
 *  6. workspace 初始化状态
 *  7. 依赖完整性
 */

import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveConfigPath, expandTilde, OUROBOROS_HOME } from "../../config/resolver.js";

interface CheckResult {
  readonly name: string;
  readonly status: "ok" | "warn" | "fail";
  readonly message: string;
}

/**
 * 执行所有诊断检查
 */
async function runChecks(): Promise<readonly CheckResult[]> {
  const results: CheckResult[] = [];

  // 1. Node.js 版本
  const nodeVersion = process.versions.node;
  const major = parseInt(nodeVersion.split(".")[0], 10);
  results.push({
    name: "Node.js 版本",
    status: major >= 20 ? "ok" : "fail",
    message: major >= 20
      ? `v${nodeVersion} (≥ 20 ✓)`
      : `v${nodeVersion} (需要 ≥ 20)`,
  });

  // 2. 配置文件
  const resolved = await resolveConfigPath();
  if (resolved) {
    results.push({
      name: "配置文件",
      status: "ok",
      message: `${resolved.path} (来源: ${resolved.source})`,
    });

    // 尝试解析配置
    try {
      const content = await readFile(resolved.path, "utf-8");
      JSON.parse(content);
      results.push({
        name: "配置格式",
        status: "ok",
        message: "JSON 格式正确",
      });
    } catch {
      results.push({
        name: "配置格式",
        status: "fail",
        message: "JSON 格式错误",
      });
    }
  } else {
    results.push({
      name: "配置文件",
      status: "warn",
      message: "未找到配置文件，请运行 ouroboros init",
    });
  }

  // 3. 用户数据目录
  const home = expandTilde(OUROBOROS_HOME);
  try {
    await access(home);
    results.push({
      name: "用户数据目录",
      status: "ok",
      message: home,
    });
  } catch {
    results.push({
      name: "用户数据目录",
      status: "warn",
      message: `${home} 不存在，请运行 ouroboros init`,
    });
  }

  // 4. OAuth 凭据
  const authPath = join(home, "auth.json");
  try {
    const authContent = await readFile(authPath, "utf-8");
    const auth = JSON.parse(authContent) as Record<string, unknown>;
    const providerCount = Object.keys(auth).length;
    results.push({
      name: "OAuth 凭据",
      status: providerCount > 0 ? "ok" : "warn",
      message: providerCount > 0
        ? `${providerCount} 个提供商已认证`
        : "无 OAuth 凭据",
    });
  } catch {
    results.push({
      name: "OAuth 凭据",
      status: "warn",
      message: "未找到 auth.json",
    });
  }

  // 5. PID 文件（检查服务是否运行中）
  const pidPath = join(home, "ouroboros.pid");
  try {
    const pidStr = await readFile(pidPath, "utf-8");
    const pid = parseInt(pidStr.trim(), 10);
    try {
      process.kill(pid, 0); // 检查进程是否存在
      results.push({
        name: "服务状态",
        status: "ok",
        message: `运行中 (PID: ${pid})`,
      });
    } catch {
      results.push({
        name: "服务状态",
        status: "warn",
        message: `PID 文件存在但进程已终止 (PID: ${pid})`,
      });
    }
  } catch {
    results.push({
      name: "服务状态",
      status: "warn",
      message: "未运行",
    });
  }

  // 6. 依赖检查
  try {
    await import("@mariozechner/pi-ai");
    results.push({
      name: "pi-ai 依赖",
      status: "ok",
      message: "已安装",
    });
  } catch {
    results.push({
      name: "pi-ai 依赖",
      status: "fail",
      message: "未安装，请运行 npm install",
    });
  }

  return results;
}

/**
 * 格式化并输出诊断结果
 */
function formatResults(results: readonly CheckResult[]): void {
  const icons: Record<string, string> = {
    ok: "[OK]",
    warn: "[!!]",
    fail: "[FAIL]",
  };

  console.log("\n  Ouroboros 环境诊断\n");

  for (const r of results) {
    const icon = icons[r.status] ?? "[??]";
    console.log(`  ${icon} ${r.name}: ${r.message}`);
  }

  const failCount = results.filter((r) => r.status === "fail").length;
  const warnCount = results.filter((r) => r.status === "warn").length;

  console.log("");
  if (failCount > 0) {
    console.log(`  ${failCount} 个错误, ${warnCount} 个警告`);
    console.log("  请修复上述错误后重试\n");
  } else if (warnCount > 0) {
    console.log(`  全部通过 (${warnCount} 个警告)\n`);
  } else {
    console.log("  全部通过\n");
  }
}

/**
 * doctor 命令入口
 */
export async function runDoctor(): Promise<void> {
  const results = await runChecks();
  formatResults(results);

  const hasFailure = results.some((r) => r.status === "fail");
  if (hasFailure) {
    process.exitCode = 1;
  }
}
