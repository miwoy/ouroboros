/**
 * 系统监控面板
 *
 * 三个 Tab：Self Schema | Skills | Tools
 * 保留顶部系统指标面板。
 */

import { useEffect, useState } from "react";
import * as api from "../services/api";
import type { HealthData, SelfSchemaData, SkillInfo, ToolInfo } from "../services/api";
import { useBodySchema } from "../hooks/useBodySchema";
import "./MonitorPage.css";

type TabId = "self-schema" | "skills" | "tools";

export function MonitorPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("self-schema");

  // 自我图式（WS 实时 + REST 兜底）
  const schema = useBodySchema();
  // 技能列表
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  // 工具列表
  const [tools, setTools] = useState<ToolInfo[]>([]);

  useEffect(() => {
    loadHealth();
    const timer = setInterval(loadHealth, 5000);
    return () => clearInterval(timer);
  }, []);

  // 切换 tab 时加载对应数据
  useEffect(() => {
    if (activeTab === "skills") loadSkills();
    else if (activeTab === "tools") loadTools();
  }, [activeTab]);

  async function loadHealth() {
    try {
      const res = await api.getHealth();
      if (res.success && res.data) {
        setHealth(res.data);
        setError(null);
      } else {
        setError(res.error?.message || "Health check failed");
      }
    } catch {
      setError("Cannot connect to server");
    }
  }

  async function loadSkills() {
    try {
      const res = await api.getSkills();
      if (res.success && res.data) setSkills(res.data);
    } catch { /* 静默 */ }
  }

  async function loadTools() {
    try {
      const res = await api.getTools();
      if (res.success && res.data) setTools(res.data);
    } catch { /* 静默 */ }
  }

  function formatUptime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  const tabs: readonly { readonly id: TabId; readonly label: string }[] = [
    { id: "self-schema", label: "Self Schema" },
    { id: "skills", label: "Skills" },
    { id: "tools", label: "Tools" },
  ];

  return (
    <div className="monitor-page">
      <div className="monitor-header">
        <h2>System Monitor</h2>
        <p className="monitor-subtitle">
          Self schema, registered skills, tools, and system health.
        </p>
      </div>

      {error && <div className="monitor-error">{error}</div>}

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-label">Status</div>
          <div className={`metric-value ${health?.status === "ok" ? "text-success" : "text-danger"}`}>
            {health?.status || "unknown"}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Version</div>
          <div className="metric-value">{health?.version || "-"}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Uptime</div>
          <div className="metric-value">
            {health ? formatUptime(health.uptime) : "-"}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">API Endpoint</div>
          <div className="metric-value metric-mono">
            {import.meta.env.VITE_API_BASE || "http://127.0.0.1:3000"}
          </div>
        </div>
      </div>

      {/* Tab 栏 */}
      <div className="monitor-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`monitor-tab ${activeTab === tab.id ? "monitor-tab-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      <div className="monitor-tab-content">
        {activeTab === "self-schema" && <SelfSchemaTab schema={schema} />}
        {activeTab === "skills" && <SkillsTab skills={skills} />}
        {activeTab === "tools" && <ToolsTab tools={tools} />}
      </div>
    </div>
  );
}

// ─── Self Schema Tab ──────────────────────────────────

function SelfSchemaTab({ schema }: { readonly schema: SelfSchemaData | null }) {
  if (!schema) {
    return <div className="tab-placeholder">加载中...</div>;
  }

  return (
    <div className="self-schema-tab">
      {/* 身体图式 */}
      <div className="schema-section">
        <h4>身体图式 (Body Schema)</h4>
        {schema.body ? (
          <div className="schema-grid">
            <div className="schema-item">
              <span className="schema-key">平台</span>
              <span className="schema-val">{schema.body.platform}</span>
            </div>
            <div className="schema-item">
              <span className="schema-key">Node 版本</span>
              <span className="schema-val">{schema.body.nodeVersion}</span>
            </div>
            <div className="schema-item">
              <span className="schema-key">内存</span>
              <span className="schema-val">
                {schema.body.memory.availableGB}GB / {schema.body.memory.totalGB}GB (已用 {schema.body.memory.usagePercent}%)
              </span>
            </div>
            <div className="schema-item">
              <span className="schema-key">磁盘</span>
              <span className="schema-val">
                可用 {schema.body.disk.availableGB}GB / 总计 {schema.body.disk.totalGB}GB
              </span>
            </div>
            <div className="schema-item">
              <span className="schema-key">CPU 核心</span>
              <span className="schema-val">{schema.body.cpuCores}</span>
            </div>
            {schema.body.gpu.length > 0 && schema.body.gpu.map((g, i) => (
              <div key={i} className="schema-item">
                <span className="schema-key">GPU {schema.body!.gpu.length > 1 ? i + 1 : ""}</span>
                <span className="schema-val">{g.name} ({g.memoryMB}MB, 利用率 {g.utilization}%)</span>
              </div>
            ))}
            <div className="schema-item">
              <span className="schema-key">工作空间</span>
              <span className="schema-val schema-mono">{schema.body.workspacePath}</span>
            </div>
          </div>
        ) : (
          <p className="schema-empty">未配置</p>
        )}
      </div>

      {/* 灵魂图式 */}
      <div className="schema-section">
        <h4>灵魂图式 (Soul Schema)</h4>
        {schema.soul ? (
          <div className="schema-grid">
            <div className="schema-item">
              <span className="schema-key">核心指令</span>
              <span className="schema-val">{schema.soul.worldModel.coreDirective}</span>
            </div>
            <div className="schema-item">
              <span className="schema-key">协议版本</span>
              <span className="schema-val">{schema.soul.worldModel.protocolVersion}</span>
            </div>
            <div className="schema-item">
              <span className="schema-key">身份</span>
              <span className="schema-val">{schema.soul.selfAwareness.identity}</span>
            </div>
            <div className="schema-item">
              <span className="schema-key">目的</span>
              <span className="schema-val">{schema.soul.selfAwareness.purpose}</span>
            </div>
          </div>
        ) : (
          <p className="schema-empty">未配置</p>
        )}
      </div>

      {/* 激素系统 */}
      <div className="schema-section">
        <h4>激素系统 (Hormones)</h4>
        {schema.hormones ? (
          <div className="hormones-grid">
            <HormoneGauge label="专注度 (Focus)" value={schema.hormones.focusLevel} />
            <HormoneGauge label="谨慎度 (Caution)" value={schema.hormones.cautionLevel} />
            <HormoneGauge label="创造力 (Creativity)" value={schema.hormones.creativityLevel} />
          </div>
        ) : (
          <p className="schema-empty">未配置</p>
        )}
      </div>
    </div>
  );
}

function HormoneGauge({ label, value }: { readonly label: string; readonly value: number }) {
  const color = value > 70 ? "var(--color-success)" : value > 30 ? "var(--color-primary)" : "var(--color-warning)";
  return (
    <div className="hormone-gauge">
      <div className="hormone-label">{label}</div>
      <div className="hormone-bar">
        <div className="hormone-fill" style={{ width: `${value}%`, background: color }} />
      </div>
      <div className="hormone-value">{value}</div>
    </div>
  );
}

// ─── Skills Tab ──────────────────────────────────

function SkillsTab({ skills }: { readonly skills: readonly SkillInfo[] }) {
  if (skills.length === 0) {
    return <div className="tab-placeholder">暂无已注册技能</div>;
  }
  return (
    <div className="entity-card-list">
      {skills.map((s) => (
        <div key={s.id} className="entity-card">
          <div className="entity-card-header">
            <span className="entity-name">{s.name}</span>
            <span className={`entity-badge badge-${s.origin}`}>{s.origin}</span>
            <span className={`entity-status status-${s.status}`}>{s.status}</span>
          </div>
          <div className="entity-id">{s.id}</div>
          <div className="entity-desc">{s.description}</div>
          {s.tags.length > 0 && (
            <div className="entity-tags">
              {s.tags.map((t) => <span key={t} className="entity-tag">{t}</span>)}
            </div>
          )}
          {s.requiredTools.length > 0 && (
            <div className="entity-deps">
              依赖: {s.requiredTools.join(", ")}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Tools Tab ──────────────────────────────────

function ToolsTab({ tools }: { readonly tools: readonly ToolInfo[] }) {
  if (tools.length === 0) {
    return <div className="tab-placeholder">暂无已注册工具</div>;
  }
  return (
    <div className="entity-card-list">
      {tools.map((t) => (
        <div key={t.id} className="entity-card">
          <div className="entity-card-header">
            <span className="entity-name">{t.name}</span>
            <span className={`entity-status status-${t.status}`}>{t.status}</span>
          </div>
          <div className="entity-id">{t.id}</div>
          <div className="entity-desc">{t.description}</div>
          <div className="entity-meta">
            <span>入口: <code>{t.entrypoint}</code></span>
            {t.timeout && <span>超时: {t.timeout}ms</span>}
          </div>
          {t.tags.length > 0 && (
            <div className="entity-tags">
              {t.tags.map((tag) => <span key={tag} className="entity-tag">{tag}</span>)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
