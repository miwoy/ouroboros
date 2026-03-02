/**
 * 执行树可视化组件
 *
 * 纯 CSS 实现垂直缩进树形结构，支持节点状态色、hover 详情、活跃高亮。
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
function truncate(text: string, maxLen = 60): string {
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

/** 单个节点卡片 */
function TreeNodeCard({
  node,
  tree,
  depth,
}: {
  readonly node: ExecutionNode;
  readonly tree: ExecutionTree;
  readonly depth: number;
}) {
  const [hovered, setHovered] = useState(false);
  const icon = nodeTypeIcon(node.nodeType);
  const isActive = node.id === tree.activeNodeId;

  return (
    <div className="tree-node-wrapper">
      <div
        className={`tree-node-card ${isActive ? "tree-node-active" : ""}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <span className={`node-type-icon ${icon.className}`}>{icon.letter}</span>
        <span className={`node-state-dot state-${stateClass(node.state)}`} />
        <span className="node-summary">{truncate(node.summary)}</span>

        {hovered && (
          <div className="node-tooltip">
            <div className="tooltip-row">
              <span className="tooltip-label">类型</span>
              <span>{node.nodeType}</span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">状态</span>
              <span>{node.state}</span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">摘要</span>
              <span>{node.summary}</span>
            </div>
            {node.resultSummary && (
              <div className="tooltip-row">
                <span className="tooltip-label">结果</span>
                <span>{node.resultSummary}</span>
              </div>
            )}
            <div className="tooltip-row">
              <span className="tooltip-label">创建</span>
              <span>{new Date(node.createdAt).toLocaleTimeString()}</span>
            </div>
            {node.completedAt && (
              <div className="tooltip-row">
                <span className="tooltip-label">完成</span>
                <span>{new Date(node.completedAt).toLocaleTimeString()}</span>
              </div>
            )}
            <div className="tooltip-row">
              <span className="tooltip-label">时长</span>
              <span>{formatDuration(node.createdAt, node.completedAt)}</span>
            </div>
            {node.retryCount > 0 && (
              <div className="tooltip-row">
                <span className="tooltip-label">重试</span>
                <span>{node.retryCount} 次</span>
              </div>
            )}
          </div>
        )}
      </div>

      {node.children.length > 0 && (
        <div className="tree-children">
          {node.children.map((childId) => {
            const child = tree.nodes[childId];
            if (!child) return null;
            return (
              <TreeNodeCard key={childId} node={child} tree={tree} depth={depth + 1} />
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ExecutionTreeView({ tree, streaming }: ExecutionTreeViewProps) {
  const rootNode = tree.nodes[tree.rootNodeId];
  if (!rootNode) return null;

  return (
    <div className="execution-tree-view">
      <div className="tree-header">
        <span className={`tree-state-label state-${stateClass(tree.state)}`}>
          {treeStateLabel(tree.state)}
        </span>
        {streaming && <span className="tree-live-badge">LIVE</span>}
        <span className="tree-time">
          {new Date(tree.createdAt).toLocaleTimeString()}
        </span>
      </div>
      <div className="tree-body">
        <TreeNodeCard node={rootNode} tree={tree} depth={0} />
      </div>
    </div>
  );
}
