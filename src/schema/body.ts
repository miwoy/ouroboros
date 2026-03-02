/**
 * 身体图式 — 系统资源感知
 *
 * 动态获取运行环境信息：平台、CPU、内存、磁盘。
 * 用于任务规划时的资源约束感知。
 */

import { platform, arch, totalmem, freemem, cpus } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { BodySchema, DiskInfo, GpuInfo } from "./types.js";

const execFileAsync = promisify(execFile);

/**
 * 获取身体图式（当前系统资源快照）
 */
export function getBodySchema(workspacePath: string): BodySchema {
  const totalMem = totalmem();
  const freeMem = freemem();
  const totalGB = (totalMem / 1024 / 1024 / 1024).toFixed(1);
  const availableGB = (freeMem / 1024 / 1024 / 1024).toFixed(1);
  const usagePercent = Math.round(((totalMem - freeMem) / totalMem) * 100);

  return {
    platform: `${platform()} ${arch()}`,
    cpuCores: cpus().length,
    memory: { totalGB, availableGB, usagePercent },
    disk: { availableGB: "未知", totalGB: "未知" },
    gpu: [],
    nodeVersion: process.version,
    workspacePath,
    timestamp: new Date().toISOString(),
  };
}

/**
 * 获取磁盘使用信息（异步，需要执行 df 命令）
 */
export async function getDiskInfo(workspacePath: string): Promise<DiskInfo> {
  try {
    const { stdout } = await execFileAsync("df", ["-BG", workspacePath]);
    const lines = stdout.trim().split("\n");
    if (lines.length < 2) return { availableGB: "未知", totalGB: "未知" };

    const parts = lines[1]!.split(/\s+/);
    // df -BG 输出: Filesystem 1G-blocks Used Available Use% Mounted
    const totalGB = parts[1]?.replace("G", "") ?? "未知";
    const availableGB = parts[3]?.replace("G", "") ?? "未知";
    return { availableGB, totalGB };
  } catch {
    return { availableGB: "未知", totalGB: "未知" };
  }
}

/**
 * 获取 GPU 信息（通过 nvidia-smi）
 *
 * 无 NVIDIA GPU 或 nvidia-smi 不可用时返回空数组。
 */
export async function getGpuInfo(): Promise<readonly GpuInfo[]> {
  try {
    const { stdout } = await execFileAsync("nvidia-smi", [
      "--query-gpu=name,memory.total,utilization.gpu",
      "--format=csv,noheader,nounits",
    ]);
    const lines = stdout.trim().split("\n").filter(Boolean);
    return lines.map((line) => {
      const parts = line.split(",").map((s) => s.trim());
      return {
        name: parts[0] ?? "Unknown",
        memoryMB: parseInt(parts[1] ?? "0", 10) || 0,
        utilization: parseInt(parts[2] ?? "0", 10) || 0,
      };
    });
  } catch {
    return [];
  }
}

/**
 * 获取完整的身体图式（含磁盘、GPU 信息）
 */
export async function getFullBodySchema(workspacePath: string): Promise<BodySchema> {
  const base = getBodySchema(workspacePath);
  const [disk, gpu] = await Promise.all([getDiskInfo(workspacePath), getGpuInfo()]);
  return { ...base, disk, gpu };
}

/**
 * 将身体图式格式化为提示词文本
 */
export function formatBodySchema(schema: BodySchema): string {
  const lines = [
    `- 运行环境: ${schema.platform} (Node.js ${schema.nodeVersion})`,
    `- CPU 核心数: ${schema.cpuCores}`,
    `- 可用内存: ${schema.memory.availableGB}GB / ${schema.memory.totalGB}GB (已用 ${schema.memory.usagePercent}%)`,
    `- 磁盘空间: 可用 ${schema.disk.availableGB}GB / 总计 ${schema.disk.totalGB}GB`,
  ];
  if (schema.gpu.length > 0) {
    for (const g of schema.gpu) {
      lines.push(`- GPU: ${g.name} (${g.memoryMB}MB, 利用率 ${g.utilization}%)`);
    }
  }
  lines.push(`- 工作目录: ${schema.workspacePath}`);
  return lines.join("\n");
}
