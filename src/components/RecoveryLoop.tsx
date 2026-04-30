import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Activity,
  Play,
  Square,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Info,
  Wrench,
  XCircle,
  Github,
  Clock,
  Shield,
  FileCode,
  GitPullRequest,
  Eye,
  Zap,
  Settings,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useAppContext } from "@/context/AppContext";

interface MonitorEvent {
  id: string;
  timestamp: string;
  level: "info" | "warning" | "error" | "fix";
  message: string;
  data?: Record<string, unknown>;
}

interface Issue {
  category: string;
  severity: string;
  file: string;
  line: number;
  title: string;
  description: string;
  code?: string;
  recommended_code?: string;
  suggested_fix?: string;
  compliance?: string;
}

interface MonitorStats {
  scans_completed: number;
  issues_found: number;
  issues_fixed: number;
  prs_created: number;
}

interface Monitor {
  monitor_id: string;
  repo_url: string;
  repo_name: string;
  status: "active" | "stopped";
  started_at: string;
  stopped_at?: string;
  poll_interval: number;
  model: string;
  auto_fix: boolean;
  stats: MonitorStats;
  recent_events: MonitorEvent[];
  total_events: number;
  tracked_files: number;
}

const BACKEND = "http://127.0.0.1:5000";

const RecoveryLoop: React.FC = () => {
  const { apiConnectivity, selectedModel, gitHubConnectivity } = useAppContext();

  // Form state
  const [repoUrl, setRepoUrl] = useState("");
  const [pollInterval, setPollInterval] = useState(300);
  const [customInterval, setCustomInterval] = useState("");
  const [autoFix, setAutoFix] = useState(true);

  // Monitor state
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [selectedMonitor, setSelectedMonitor] = useState<string | null>(null);
  const [events, setEvents] = useState<MonitorEvent[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [issuesByFile, setIssuesByFile] = useState<Record<string, Issue[]>>({});
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [showIssuesPanel, setShowIssuesPanel] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eventsEndRef = useRef<HTMLDivElement>(null);
  const eventsContainerRef = useRef<HTMLDivElement>(null);
  const isPinnedToBottom = useRef(true);

  // Poll for status updates
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND}/recovery/status`);
      if (res.ok) {
        const data = await res.json();
        setMonitors(data.monitors || []);
      }
    } catch {
      // Silent – backend may not be running
    }
  }, []);

  // Poll for events of selected monitor
  const fetchEvents = useCallback(async () => {
    if (!selectedMonitor) return;
    try {
      const res = await fetch(`${BACKEND}/recovery/events?monitor_id=${selectedMonitor}&limit=100`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch {
      // Silent
    }
  }, [selectedMonitor]);

  // Fetch issues for selected monitor
  const fetchIssues = useCallback(async () => {
    if (!selectedMonitor) return;
    try {
      const res = await fetch(`${BACKEND}/recovery/issues?monitor_id=${selectedMonitor}`);
      if (res.ok) {
        const data = await res.json();
        setIssues(data.issues || []);
        setIssuesByFile(data.by_file || {});
      }
    } catch {
      // Silent
    }
  }, [selectedMonitor]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  useEffect(() => {
    fetchEvents();
    fetchIssues();
    const interval = setInterval(() => {
      fetchEvents();
      fetchIssues();
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchEvents, fetchIssues]);

  // Smart auto-scroll: only scroll to bottom if user is already near the bottom
  useEffect(() => {
    const container = eventsContainerRef.current;
    if (!container || !isPinnedToBottom.current) return;
    container.scrollTop = container.scrollHeight;
  }, [events]);

  // Auto-select first monitor
  useEffect(() => {
    if (!selectedMonitor && monitors.length > 0) {
      setSelectedMonitor(monitors[0].monitor_id);
    }
  }, [monitors, selectedMonitor]);

  const handleStart = async () => {
    if (!repoUrl.trim()) {
      setError("Please enter a repository URL");
      return;
    }
    setIsStarting(true);
    setError(null);

    try {
      const res = await fetch(`${BACKEND}/recovery/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo_url: repoUrl.trim(),
          poll_interval: pollInterval,
          model: selectedModel,
          auto_fix: autoFix,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSelectedMonitor(data.monitor_id);
        setRepoUrl("");
        await fetchStatus();
      } else {
        setError(data.error || "Failed to start monitoring");
      }
    } catch (e) {
      setError("Cannot connect to backend. Is the server running?");
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = async (monitorId: string) => {
    try {
      await fetch(`${BACKEND}/recovery/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monitor_id: monitorId }),
      });
      await fetchStatus();
    } catch {
      setError("Failed to stop monitoring");
    }
  };

  const handleScanNow = async (monitorId: string) => {
    setIsScanning(true);
    try {
      await fetch(`${BACKEND}/recovery/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monitor_id: monitorId }),
      });
      await fetchEvents();
      await fetchIssues();
      await fetchStatus();
    } catch {
      setError("Scan request failed");
    } finally {
      setIsScanning(false);
    }
  };

  const toggleFile = (file: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "high": return "bg-red-100 text-red-700 border-red-200";
      case "medium": return "bg-yellow-100 text-yellow-700 border-yellow-200";
      case "low": return "bg-blue-100 text-blue-700 border-blue-200";
      default: return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case "security": return "bg-red-50 text-red-600";
      case "legacy": return "bg-amber-50 text-amber-600";
      default: return "bg-gray-50 text-gray-600";
    }
  };

  const activeMonitor = monitors.find((m) => m.monitor_id === selectedMonitor);

  const getEventIcon = (level: string) => {
    switch (level) {
      case "info": return <Info size={14} className="text-blue-400" />;
      case "warning": return <AlertTriangle size={14} className="text-yellow-400" />;
      case "error": return <XCircle size={14} className="text-red-400" />;
      case "fix": return <Wrench size={14} className="text-green-400" />;
      default: return <Info size={14} className="text-gray-400" />;
    }
  };

  const getEventBgColor = (level: string) => {
    switch (level) {
      case "info": return "border-l-blue-400";
      case "warning": return "border-l-yellow-400";
      case "error": return "border-l-red-400";
      case "fix": return "border-l-green-400";
      default: return "border-l-gray-400";
    }
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return iso;
    }
  };

  const canStart = apiConnectivity.isConnected && apiConnectivity.groqConfigured && pollInterval > 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Activity className="text-purple-600" size={28} />
            Recovery Loop
          </h1>
          <p className="text-slate-500 mt-1">
            Continuous monitoring &amp; auto-remediation agent for customer codebases
          </p>
        </div>
      </div>

      {/* Status Overview Cards */}
      {monitors.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Active Monitors</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">
                  {monitors.filter((m) => m.status === "active").length}
                </p>
              </div>
              <Activity className={`text-purple-600 ${
                monitors.some((m) => m.status === "active") ? "animate-pulse" : ""
              }`} size={24} />
            </div>
          </div>
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Repos</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{monitors.length}</p>
              </div>
              <Github className="text-blue-600" size={24} />
            </div>
          </div>
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Issues</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">
                  {monitors.reduce((sum, m) => sum + m.stats.issues_found, 0)}
                </p>
              </div>
              <Shield className="text-yellow-600" size={24} />
            </div>
          </div>
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">PRs Created</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">
                  {monitors.reduce((sum, m) => sum + m.stats.prs_created, 0)}
                </p>
              </div>
              <GitPullRequest className="text-green-600" size={24} />
            </div>
          </div>
        </div>
      )}

      {/* Setup Card */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-slate-700 flex items-center gap-2 mb-4">
          <Github size={20} />
          Monitor a Repository
        </h2>

        {!canStart && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-700">
              {!apiConnectivity.isConnected
                ? "Backend server not connected. Start the Flask API server first."
                : "Groq API key not configured. Add it in Settings to enable AI-powered scanning."}
            </p>
          </div>
        )}

        {!gitHubConnectivity.isConnected && (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
            <Info size={16} className="text-blue-500 mt-0.5 shrink-0" />
            <p className="text-sm text-blue-700">
              GitHub token not configured. Auto-fix PRs require a GitHub token (configure in Settings).
              You can still monitor public repos without it.
            </p>
          </div>
        )}

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
            <XCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
              <XCircle size={14} />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Repository URL
            </label>
            <input
              type="text"
              placeholder="owner/repo or https://github.com/owner/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
              disabled={isStarting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Poll Interval
            </label>
            {(() => {
              const presets = [60, 300, 600, 1800, 3600, 86400];
              const isCustom = pollInterval === -1 || !presets.includes(pollInterval);
              const selectValue = pollInterval === -1 ? -1 : (presets.includes(pollInterval) ? pollInterval : -1);
              return (
                <>
                  <select
                    value={selectValue}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (val === -1) {
                        setPollInterval(-1);
                        setCustomInterval("");
                      } else {
                        setPollInterval(val);
                      }
                    }}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                    disabled={isStarting}
                  >
                    <option value={60}>Every 1 min</option>
                    <option value={300}>Every 5 min</option>
                    <option value={600}>Every 10 min</option>
                    <option value={1800}>Every 30 min</option>
                    <option value={3600}>Every 1 hour</option>
                    <option value={86400}>Every 24 hours</option>
                    <option value={-1}>{isCustom && pollInterval > 0 ? `Custom (${pollInterval}s)` : 'Custom...'}</option>
                  </select>
                  {pollInterval === -1 && (
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="number"
                        min={10}
                        placeholder="Seconds"
                        value={customInterval}
                        onChange={(e) => setCustomInterval(e.target.value)}
                        className="flex-1 px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                        disabled={isStarting}
                      />
                      <button
                        onClick={() => {
                          const val = Number(customInterval);
                          if (val >= 10) setPollInterval(val);
                        }}
                        disabled={!customInterval || Number(customInterval) < 10}
                        className="px-3 py-1.5 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 transition-colors"
                      >
                        Set
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          <div className="flex flex-col justify-end">
            <button
              onClick={handleStart}
              disabled={isStarting || !canStart}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {isStarting ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <Play size={16} />
              )}
              {isStarting ? "Starting..." : "Start Monitoring"}
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={autoFix}
              onChange={(e) => setAutoFix(e.target.checked)}
              className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
            />
            <Zap size={14} className="text-yellow-500" />
            Auto-fix: Create PRs with remediation automatically
          </label>
        </div>
      </div>

      {/* Monitors List + Detail */}
      {monitors.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)] gap-6 items-start">
          {/* Left: Monitor list */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
              Monitored Repos
            </h3>
            {monitors.map((m) => (
              <button
                key={m.monitor_id}
                onClick={() => setSelectedMonitor(m.monitor_id)}
                className={`w-full text-left p-4 rounded-xl border transition-all ${
                  selectedMonitor === m.monitor_id
                    ? "bg-purple-50 border-purple-300 shadow-sm"
                    : "bg-white border-gray-200 hover:border-purple-200"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm text-slate-800 truncate">
                    {m.repo_name}
                  </span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    m.status === "active"
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-600"
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      m.status === "active" ? "bg-green-500 animate-pulse" : "bg-gray-400"
                    }`} />
                    {m.status}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-2">
                  <span className="flex items-center gap-1">
                    <FileCode size={11} /> {m.tracked_files} files
                  </span>
                  <span className="flex items-center gap-1">
                    <Shield size={11} /> {m.stats.issues_found} issues
                  </span>
                  <span className="flex items-center gap-1">
                    <GitPullRequest size={11} /> {m.stats.prs_created} PRs
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Right: Monitor detail */}
          {activeMonitor && (
            <div className="space-y-4 min-w-0">
              {/* Stats cards */}
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="bg-white rounded-xl border p-4 text-center">
                  <Eye size={18} className="mx-auto text-blue-500 mb-1" />
                  <div className="text-xl font-bold text-slate-800">
                    {activeMonitor.stats.scans_completed}
                  </div>
                  <div className="text-[11px] text-slate-500">Scans</div>
                </div>
                <div className="bg-white rounded-xl border p-4 text-center">
                  <AlertTriangle size={18} className="mx-auto text-yellow-500 mb-1" />
                  <div className="text-xl font-bold text-slate-800">
                    {activeMonitor.stats.issues_found}
                  </div>
                  <div className="text-[11px] text-slate-500">Issues Found</div>
                </div>
                <div className="bg-white rounded-xl border p-4 text-center">
                  <CheckCircle size={18} className="mx-auto text-green-500 mb-1" />
                  <div className="text-xl font-bold text-slate-800">
                    {activeMonitor.stats.issues_fixed}
                  </div>
                  <div className="text-[11px] text-slate-500">Auto-Fixed</div>
                </div>
                <div className="bg-white rounded-xl border p-4 text-center">
                  <GitPullRequest size={18} className="mx-auto text-purple-500 mb-1" />
                  <div className="text-xl font-bold text-slate-800">
                    {activeMonitor.stats.prs_created}
                  </div>
                  <div className="text-[11px] text-slate-500">PRs Created</div>
                </div>
              </div>

              {/* Controls */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-slate-600 min-w-0">
                  <span className="font-medium">{activeMonitor.repo_name}</span>
                  <span className="mx-2 text-slate-300">|</span>
                  <span className="text-slate-400">
                    Polling every {activeMonitor.poll_interval < 60
                      ? `${activeMonitor.poll_interval}s`
                      : activeMonitor.poll_interval < 3600
                        ? `${Math.round(activeMonitor.poll_interval / 60)}m`
                        : `${Math.round(activeMonitor.poll_interval / 3600)}h`}
                  </span>
                  <span className="mx-2 text-slate-300">|</span>
                  <span className="text-slate-400">
                    {activeMonitor.auto_fix ? "Auto-fix ON" : "Auto-fix OFF"}
                  </span>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    onClick={() => handleScanNow(activeMonitor.monitor_id)}
                    disabled={isScanning || activeMonitor.status !== "active"}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg text-xs font-medium transition-colors"
                  >
                    <RefreshCw size={13} className={isScanning ? "animate-spin" : ""} />
                    Scan Now
                  </button>
                  {activeMonitor.status === "active" ? (
                    <button
                      onClick={() => handleStop(activeMonitor.monitor_id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium transition-colors"
                    >
                      <Square size={13} />
                      Stop
                    </button>
                  ) : (
                    <span className="px-3 py-1.5 bg-gray-100 text-gray-500 rounded-lg text-xs font-medium">
                      Stopped
                    </span>
                  )}
                </div>
              </div>

              {/* Event Log */}
              <div className="bg-slate-900 rounded-xl border overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
                  <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                    <Activity size={14} />
                    Agent Activity Log
                  </h3>
                  <span className="text-[10px] text-slate-500">
                    {events.length} event(s)
                  </span>
                </div>
                <div
                  ref={eventsContainerRef}
                  className="max-h-96 overflow-y-auto p-3 space-y-1.5"
                  onScroll={() => {
                    const el = eventsContainerRef.current;
                    if (!el) return;
                    // Consider "pinned" if within 60px of the bottom
                    isPinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
                  }}
                >
                  {events.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-8">
                      No events yet. Start monitoring to see activity.
                    </p>
                  ) : (
                    events.map((evt) => (
                      <div
                        key={evt.id}
                        className={`flex items-start gap-2 px-3 py-2 rounded-lg border-l-2 bg-slate-800/50 ${getEventBgColor(evt.level)}`}
                      >
                        <span className="mt-0.5 shrink-0">{getEventIcon(evt.level)}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-200">{evt.message}</p>
                          {evt.data && (
                            <div className="mt-1 text-[11px] text-slate-400">
                              {evt.data.pr_url && (
                                <a
                                  href={String(evt.data.pr_url)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-purple-400 hover:text-purple-300 underline"
                                >
                                  View Pull Request
                                </a>
                              )}
                              {evt.data.issues_summary && (
                                <span>
                                  High: {(evt.data.issues_summary as Record<string, number>).high},
                                  Med: {(evt.data.issues_summary as Record<string, number>).medium},
                                  Low: {(evt.data.issues_summary as Record<string, number>).low}
                                  {" — "}
                                  <button
                                    onClick={() => setShowIssuesPanel(true)}
                                    className="text-purple-400 hover:text-purple-300 underline ml-1"
                                  >
                                    View Details
                                  </button>
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500 whitespace-nowrap shrink-0">
                          {formatTime(evt.timestamp)}
                        </span>
                      </div>
                    ))
                  )}
                  <div ref={eventsEndRef} />
                </div>
              </div>

              {/* Issues Detail Panel */}
              {(showIssuesPanel || issues.length > 0) && (
                <div className="bg-white rounded-xl border overflow-hidden">
                  <div className="px-4 py-3 border-b flex items-center justify-between">
                    <h3 className="text-sm font-medium text-slate-700 flex items-center gap-2">
                      <Shield size={14} className="text-red-500" />
                      Scan Issues ({issues.length})
                    </h3>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                        {issues.filter((i) => i.severity === "high").length} High
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                        {issues.filter((i) => i.severity === "medium").length} Medium
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                        {issues.filter((i) => i.severity === "low").length} Low
                      </span>
                      <button
                        onClick={() => setShowIssuesPanel(false)}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <XCircle size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="max-h-[500px] overflow-y-auto divide-y">
                    {Object.keys(issuesByFile).length === 0 ? (
                      <p className="text-sm text-slate-500 text-center py-8">
                        No issues found in the latest scan.
                      </p>
                    ) : (
                      Object.entries(issuesByFile).map(([file, fileIssues]) => (
                        <div key={file}>
                          <button
                            onClick={() => toggleFile(file)}
                            className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 text-left"
                          >
                            {expandedFiles.has(file) ? (
                              <ChevronDown size={14} className="text-slate-400 shrink-0" />
                            ) : (
                              <ChevronRight size={14} className="text-slate-400 shrink-0" />
                            )}
                            <FileCode size={14} className="text-slate-500 shrink-0" />
                            <span className="text-sm font-medium text-slate-700 truncate flex-1">
                              {file}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {fileIssues.length} issue(s)
                            </span>
                          </button>
                          {expandedFiles.has(file) && (
                            <div className="bg-slate-50 divide-y divide-slate-100">
                              {fileIssues.map((issue, idx) => (
                                <div key={`${file}-${idx}`} className="px-6 py-3">
                                  <div className="flex items-start gap-2">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border ${getSeverityBadge(issue.severity)}`}>
                                          {issue.severity.toUpperCase()}
                                        </span>
                                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${getCategoryBadge(issue.category)}`}>
                                          {issue.category}
                                        </span>
                                        {issue.line > 0 && (
                                          <span className="text-[10px] text-slate-400">Line {issue.line}</span>
                                        )}
                                        {issue.compliance && (
                                          <span className="text-[10px] text-slate-400">({issue.compliance})</span>
                                        )}
                                      </div>
                                      <p className="text-sm font-medium text-slate-800 mt-1">
                                        {issue.title}
                                      </p>
                                      {issue.description && (
                                        <p className="text-xs text-slate-500 mt-0.5">
                                          {issue.description}
                                        </p>
                                      )}
                                      {issue.code && (
                                        <div className="mt-2">
                                          <span className="text-[10px] text-slate-400 uppercase">Flagged Code</span>
                                          <pre className="mt-0.5 px-2 py-1.5 bg-red-50 border border-red-100 rounded text-xs text-red-800 overflow-x-auto">
                                            {issue.code}
                                          </pre>
                                        </div>
                                      )}
                                      {issue.suggested_fix && (
                                        <div className="mt-2">
                                          <span className="text-[10px] text-slate-400 uppercase">Suggested Fix</span>
                                          <p className="text-xs text-green-700 mt-0.5">{issue.suggested_fix}</p>
                                        </div>
                                      )}
                                      {issue.recommended_code && (
                                        <div className="mt-2">
                                          <span className="text-[10px] text-slate-400 uppercase">Recommended Code</span>
                                          <pre className="mt-0.5 px-2 py-1.5 bg-green-50 border border-green-100 rounded text-xs text-green-800 overflow-x-auto">
                                            {issue.recommended_code}
                                          </pre>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {monitors.length === 0 && (
        <div className="bg-white rounded-xl border p-12 text-center">
          <Activity size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-700 mb-2">
            No repositories being monitored
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Enter a GitHub repository URL above to start the Recovery Loop agent.
            It will continuously monitor the codebase for security vulnerabilities,
            legacy code patterns, and automatically create pull requests with fixes.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-purple-500" />
              Security Scanning
            </div>
            <div className="flex items-center gap-2">
              <FileCode size={16} className="text-blue-500" />
              Legacy Code Detection
            </div>
            <div className="flex items-center gap-2">
              <Wrench size={16} className="text-green-500" />
              Auto-Remediation
            </div>
            <div className="flex items-center gap-2">
              <GitPullRequest size={16} className="text-orange-500" />
              PR Creation
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecoveryLoop;
