/**
 * 审查程序核心
 *
 * 综合运行所有审查规则，收集异常报告和干预建议。
 * 支持定时调度（异步，不阻塞主循环）。
 */

import type { InspectorAction } from "../core/types.js";
import type { Logger } from "../logger/types.js";
import type { InspectorConfig, InspectionContext, InspectionResult, Inspector } from "./types.js";
import { checkDeadLoop, checkHighRetry, checkTimeout, checkResourceExhausted } from "./rules.js";

/** 默认审查配置 */
export const DEFAULT_INSPECTOR_CONFIG: InspectorConfig = {
  enabled: true,
  checkInterval: 180000,
  loopDetectionThreshold: 3,
  maxRetryThreshold: 5,
  minAvailableMemoryMB: 100,
  maxExecutionTimeSecs: 3600,
};

/**
 * 创建审查程序
 */
export function createInspector(logger: Logger): Inspector {
  let timer: ReturnType<typeof setInterval> | null = null;
  let latestResult: InspectionResult | null = null;

  return {
    inspect(context: InspectionContext): InspectionResult {
      const reports = [];
      const suggestedActions: InspectorAction[] = [];

      // 运行所有规则
      const loopReport = checkDeadLoop(context);
      if (loopReport) reports.push(loopReport);

      const retryReport = checkHighRetry(context);
      if (retryReport) reports.push(retryReport);

      const timeoutReport = checkTimeout(context);
      if (timeoutReport) reports.push(timeoutReport);

      const resourceReport = checkResourceExhausted(context);
      if (resourceReport) reports.push(resourceReport);

      // 为每个报告生成干预动作
      for (const report of reports) {
        suggestedActions.push({
          treeId: report.treeId,
          action: report.suggestedAction,
          targetNodeId: report.nodeId,
          reason: report.description,
          timestamp: report.timestamp,
        });
      }

      const result: InspectionResult = {
        hasAnomalies: reports.length > 0,
        reports,
        suggestedActions,
        timestamp: new Date().toISOString(),
      };

      latestResult = result;

      if (result.hasAnomalies) {
        logger.warn("inspector", `检测到 ${reports.length} 个异常`, {
          types: reports.map((r) => r.exceptionType),
        });
      }

      return result;
    },

    start(getContext: () => InspectionContext): void {
      if (timer) return;

      const config = getContext().config;
      if (!config.enabled) return;

      timer = setInterval(() => {
        try {
          const context = getContext();
          this.inspect(context);
        } catch (err) {
          logger.error("inspector", "审查异常", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }, config.checkInterval);

      logger.info("inspector", "审查程序启动", {
        interval: config.checkInterval,
      });
    },

    stop(): void {
      if (timer) {
        clearInterval(timer);
        timer = null;
        logger.info("inspector", "审查程序停止");
      }
    },

    getLatestResult(): InspectionResult | null {
      return latestResult;
    },
  };
}
