/**
 * 执行树可视化组件
 *
 * 点击节点展开详情面板（替代 hover tooltip，解决遮挡问题）。
 * 节点卡片直接显示：类型图标 + 状态点 + 摘要 + 时长 + 结果。
 */

import { useState } from "react";
import type { ExecutionTree, ExecutionNode } from "../services/api";
import "./ExecutionTreeView.css";

interface ExecutionTreeViewProps {
  readonly tree: ExecutionTree;
  readonly streaming?: boolean;
}

/** 树状态标签文本 */
function treeStateLabel(state: string): string {
  const labels: Record<string, string> = {
    running: "运行中",
    paused: "已暂停",
    completed: "已完成",
    failed: "已失败",
    cancelled: "已取消",
  };
  return labels[state] || state;
}

/** 状态 → CSS 类名后缀 */
function stateClass(state: string): string {
  const map: Record<string, string> = {
    completed: "completed",
    working: "working",
    submitted: "submitted",
    failed: "failed",
    cancelled: "cancelled",
    paused: "paused",
    "input-required": "input-required",
  };
  return map[state] || "submitted";
}

/** 节点状态中文 */
function stateLabel(state: string): string {
  const labels: Record<string, string> = {
    completed: "完成",
    working: "执行中",
    submitted: "等待中",
    failed: "失败",
    cancelled: "已取消",
    paused: "暂停",
    "input-required": "等待输入",
  };
  return labels[state] || state;
}

/** 节点类型中文 */
function nodeTypeLabel(nodeType: string): string {
  const labels: Record<string, string> = {
    root: "根节点",
    "model-call": "模型调用",
    "tool-call": "工具调用",
    "agent-call": "Agent 调用",
  };
  return labels[nodeType] || nodeType;
}

/** 节点类型 → 图标字母 + CSS 类名 */
function nodeTypeIcon(nodeType: string): { letter: string; className: string } {
  const map: Record<string, { letter: string; className: string }> = {
    root: { letter: "R", className: "type-root" },
    "model-call": { letter: "M", className: "type-model" },
    "tool-call": { letter: "T", className: "type-tool" },
    "agent-call": { letter: "A", className: "type-agent" },
  };
  return map[nodeType] || { letter: "?", className: "type-root" };
}

/** 计算执行时长 */
function formatDuration(createdAt: string, completedAt?: string): string {
  const start = new Date(createdAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

/** 截断摘要文本 */
function truncate(text: string, maxLen = 80): string {
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

/** 统计信息 */
function TreeStats({ tree }: { readonly tree: ExecutionTree }) {
  const nodes = Object.values(tree.nodes);
  const totalNodes = nodes.length;
  const completedNodes = nodes.filter((n) => n.state === "completed").length;
  const failedNodes = nodes.filter((n) => n.state === "failed").length;
  const toolCalls = nodes.filter((n) => n.nodeType === "tool-call").length;
  const modelCalls = nodes.filter((n) => n.nodeType === "model-call").length;

  return (
    <div className="tree-stats">
      <span className="tree-stat" title="总节点">
        <span className="stat-icon">&#x2261;</span> {totalNodes}
      </span>
      <span className="tree-stat" title="模型调用">
        <span className="stat-icon stat-model">M</span> {modelCalls}
      </span>
      <span className="tree-stat" title="工具调用">
        <span className="stat-icon stat-tool">T</span> {toolCalls}
      </span>
      {completedNodes > 0 && (
        <span className="tree-stat stat-success" title="已完成">
          &#x2713; {completedNodes}
        </span>
      )}
      {failedNodes > 0 && (
        <span className="tree-stat stat-fail" title="已失败">
          &#x2717; {failedNodes}
        </span>
      )}
    </div>
  );
}

/** 节点详情面板（点击展开） */
function NodeDetailPanel({ node }: { readonly node: ExecutionNode }) {
  return (
    <div className="node-detail-panel">
      <div className="detail-grid">
        <div className="detail-item">
          <span className="detail-label">类型</span>
          <span className="detail-value">{nodeTypeLabel(node.nodeType)}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">状态</span>
          <span className={`detail-value detail-state state-${stateClass(node.state)}`}>
            {stateLabel(node.state)}
          </span>
        </div>
        <div className="detail-item">
          <span className="detail-label">时长</span>
          <span className="detail-value">{formatDuration(node.createdAt, node.completedAt)}</span>
        </div>
        {node.retryCount > 0 && (
          <div className="detail-item">
            <span className="detail-label">重试</span>
            <span className="detail-value">{node.retryCount} 次</span>
          </div>
        )}
        <div className="detail-item">
          <span className="detail-label">创建</span>
          <span className="detail-value detail-mono">
            {new Date(node.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
        </div>
        {node.completedAt && (
          <div className="detail-item">
            <span className="detail-label">完成</span>
            <span className="detail-value detail-mono">
              {new Date(node.completedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          </div>
        )}
      </div>
      <div className="detail-full">
        <span className="detail-label">摘要</span>
        <div className="detail-text">{node.summary}</div>
      </div>
      {node.resultSummary && (
        <div className="detail-full">
          <span className="detail-label">结果</span>
          <div className="detail-text detail-result">{node.resultSummary}</div>
        </div>
      )}
    </div>
  );
}

/** 单个节点卡片 */
function TreeNodeCard({
  node,
  tree,
  depth,
  isLive,
  selectedId,
  onSelect,
}: {
  readonly node: ExecutionNode;
  readonly tree: ExecutionTree;
  readonly depth: number;
  readonly isLive?: boolean;
  readonly selectedId: string | null;
  readonly onSelect: (id: string | null) => void;
}) {
  const icon = nodeTypeIcon(node.nodeType);
  const isActive = node.id === tree.activeNodeId;
  const isRunning = node.state === "working" || node.state === "submitted";
  const isSelected = selectedId === node.id;
  const duration = formatDuration(node.createdAt, node.completedAt);
  const isCompleted = node.state === "completed";
  const isFailed = node.state === "failed";

  return (
    <div className="tree-node-wrapper">
      <div
        className={[
          "tree-node-card",
          isActive && isLive ? "tree-node-active tree-node-live" : isActive ? "tree-node-active" : "",
          isSelected ? "tree-node-selected" : "",
        ].filter(Boolean).join(" ")}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(isSelected ? null : node.id);
        }}
      >
        {isRunning && isLive ? (
          <span className={`node-type-icon ${icon.className} node-spinner`}>{icon.letter}</span>
        ) : (
          <span className={`node-type-icon ${icon.className}`}>{icon.letter}</span>
        )}
        <span className={`node-state-dot state-${stateClass(node.state)}`} />
        <span className="node-summary">{truncate(node.summary)}</span>
        <span className="node-duration">{duration}</span>
        {isCompleted && node.resultSummary && (
          <span className="node-result-badge node-result-ok" title={node.resultSummary}>
            &#x2713;
          </span>
        )}
        {isFailed && (
          <span className="node-result-badge node-result-fail" title={node.resultSummary ?? "失败"}>
            &#x2717;
          </span>
        )}
      </div>

      {/* 点击展开的详情面板（在节点下方内联，不会被裁剪） */}
      {isSelected && <NodeDetailPanel node={node} />}

      {node.children.length > 0 && (
        <div className="tree-children">
          {node.children.map((childId) => {
            const child = tree.nodes[childId];
            if (!child) return null;
            return (
              <TreeNodeCard
                key={childId}
                node={child}
                tree={tree}
                depth={depth + 1}
                isLive={isLive}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ExecutionTreeView({ tree, streaming }: ExecutionTreeViewProps) {
  const rootNode = tree.nodes[tree.rootNodeId];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (!rootNode) return null;

  return (
    <div className="execution-tree-view">
      <div className="tree-header">
        <span className={`tree-state-label state-${stateClass(tree.state)}`}>
          {treeStateLabel(tree.state)}
        </span>
        {streaming && <span className="tree-live-badge">LIVE</span>}
        <TreeStats tree={tree} />
        <span className="tree-time">
          {new Date(tree.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
      </div>
      <div className="tree-body">
        <TreeNodeCard
          node={rootNode}
          tree={tree}
          depth={0}
          isLive={streaming}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>
    </div>
  );
}
