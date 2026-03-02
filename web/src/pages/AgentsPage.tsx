/**
 * Agent 管理面板
 */

import { useEffect, useState } from "react";
import * as api from "../services/api";
import type { AgentInfo } from "../services/api";
import "./AgentsPage.css";

export function AgentsPage() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAgents();
  }, []);

  async function loadAgents() {
    setLoading(true);
    const res = await api.listAgents();
    if (res.success && res.data) {
      setAgents(res.data);
    } else {
      setError(res.error?.message || "Failed to load agents");
    }
    setLoading(false);
  }

  if (loading) {
    return <div className="page-loading">Loading agents...</div>;
  }

  if (error) {
    return <div className="page-error">{error}</div>;
  }

  return (
    <div className="agents-page">
      <div className="agents-header">
        <h2>Agents</h2>
        <p className="agents-subtitle">
          Manage your Agent instances. Create, view, and monitor Agents.
        </p>
      </div>
      <div className="agents-grid">
        {agents.map((agent) => (
          <div key={agent.id} className="agent-card">
            <div className="agent-card-header">
              <div className="agent-avatar">
                {agent.name.charAt(0).toUpperCase()}
              </div>
              <div className="agent-info">
                <h3 className="agent-name">{agent.name}</h3>
                <span className="agent-id">{agent.id}</span>
              </div>
              <span className={`agent-status status-${agent.status}`}>
                {agent.status}
              </span>
            </div>
            <p className="agent-description">{agent.description}</p>
            {agent.skills.length > 0 && (
              <div className="agent-skills">
                {agent.skills.map((skill) => (
                  <span key={skill} className="skill-tag">
                    {skill}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
