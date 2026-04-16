import React, { useState, useEffect, useRef } from 'react';
import {
  GitBranch, Shield, AlertTriangle, CheckCircle, Info, Loader2,
  Clock, Calendar, ChevronDown, ChevronRight, Download, X,
  Play, FileCode, RefreshCw
} from 'lucide-react';
import { exportSecurityIssuesCsv, exportSecurityIssuesPdf } from '@/lib/exportUtils';

interface AuditIssue {
  id: string;
  file: string;
  line: number;
  severity: string;
  standard: string;
  title: string;
  description: string;
  code: string;
  recommended_code?: string;
  recommendation: string;
}

interface AuditHistoryItem {
  id: string;
  repo_url: string;
  repo_name: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  total_files: number;
  scanned_files: number;
  total_issues: number;
  high_count: number;
  medium_count: number;
  low_count: number;
}

interface ScheduleItem {
  id: string;
  repo_url: string;
  interval: string;
  is_active: boolean;
  created_at: string;
  last_run: string | null;
  next_run: string | null;
}

const BACKEND = 'http://127.0.0.1:5000';

const RepoSecurityAudit: React.FC = () => {
  const [repoUrl, setRepoUrl] = useState('');
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [auditStatus, setAuditStatus] = useState('');
  const [progress, setProgress] = useState({ scanned: 0, total: 0, currentFile: '' });
  const [auditIssues, setAuditIssues] = useState<AuditIssue[]>([]);
  const [auditError, setAuditError] = useState('');
  const [auditRepoName, setAuditRepoName] = useState('');

  const [auditHistory, setAuditHistory] = useState<AuditHistoryItem[]>([]);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleInterval, setScheduleInterval] = useState<'daily' | 'weekly'>('weekly');
  const [scheduleRepoUrl, setScheduleRepoUrl] = useState('');

  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [selectedFilter, setSelectedFilter] = useState('all');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchHistory();
    fetchSchedules();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${BACKEND}/api/security/history?type=repos`);
      const data = await res.json();
      if (data.success && data.repo_audits) setAuditHistory(data.repo_audits);
    } catch { /* ignore */ }
  };

  const fetchSchedules = async () => {
    try {
      const res = await fetch(`${BACKEND}/api/security/schedules`);
      const data = await res.json();
      if (data.success) setSchedules(data.schedules);
    } catch { /* ignore */ }
  };

  const startAudit = async (url?: string) => {
    const targetUrl = url || repoUrl.trim();
    if (!targetUrl) return;

    setIsAuditing(true);
    setAuditError('');
    setAuditIssues([]);
    setAuditStatus('cloning');
    setProgress({ scanned: 0, total: 0, currentFile: '' });

    try {
      const res = await fetch(`${BACKEND}/api/security/scan-repo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_url: targetUrl }),
      });
      const data = await res.json();

      if (data.success) {
        setAuditId(data.audit_id);
        setAuditRepoName(data.repo_name);
        setProgress({ scanned: 0, total: data.total_files, currentFile: '' });
        setAuditStatus('scanning');
        pollRef.current = setInterval(() => pollAuditStatus(data.audit_id), 2000);
      } else {
        setAuditError(data.error || 'Failed to start audit');
        setIsAuditing(false);
      }
    } catch {
      setAuditError('Failed to connect to backend');
      setIsAuditing(false);
    }
  };

  const pollAuditStatus = async (id: string) => {
    try {
      const res = await fetch(`${BACKEND}/api/security/audit-status?audit_id=${id}`);
      const data = await res.json();
      if (data.success) {
        setProgress({ scanned: data.scanned_files, total: data.total_files, currentFile: data.current_file || '' });
        setAuditIssues(data.issues || []);
        if (data.status === 'complete' || data.status === 'error') {
          setAuditStatus(data.status);
          setIsAuditing(false);
          if (data.error) setAuditError(data.error);
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          fetchHistory();
        }
      }
    } catch { /* ignore */ }
  };

  const loadAuditFromHistory = async (item: AuditHistoryItem) => {
    try {
      const res = await fetch(`${BACKEND}/api/security/audit-status?audit_id=${item.id}`);
      const data = await res.json();
      if (data.success) {
        setAuditId(item.id);
        setAuditRepoName(item.repo_name);
        setAuditIssues(data.issues || []);
        setAuditStatus(item.status);
        setProgress({ scanned: item.scanned_files, total: item.total_files, currentFile: '' });
      }
    } catch { /* ignore */ }
  };

  const createSchedule = async () => {
    if (!scheduleRepoUrl.trim()) return;
    try {
      const res = await fetch(`${BACKEND}/api/security/schedule-audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_url: scheduleRepoUrl, interval: scheduleInterval }),
      });
      const data = await res.json();
      if (data.success) { setScheduleRepoUrl(''); fetchSchedules(); }
    } catch { /* ignore */ }
  };

  const cancelSchedule = async (scheduleId: string) => {
    try {
      await fetch(`${BACKEND}/api/security/cancel-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule_id: scheduleId }),
      });
      fetchSchedules();
    } catch { /* ignore */ }
  };

  // Group issues by file
  const issuesByFile: Record<string, AuditIssue[]> = {};
  const filteredAuditIssues = selectedFilter === 'all'
    ? auditIssues
    : auditIssues.filter(i => (i.standard || '').toLowerCase() === selectedFilter);

  for (const issue of filteredAuditIssues) {
    const f = issue.file || 'unknown';
    if (!issuesByFile[f]) issuesByFile[f] = [];
    issuesByFile[f].push(issue);
  }

  const toggleFile = (file: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file); else next.add(file);
      return next;
    });
  };

  const progressPercent = progress.total > 0 ? Math.round((progress.scanned / progress.total) * 100) : 0;

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'high': return 'bg-red-100 text-red-700 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'low': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getCategoryBadge = (standard: string) => {
    switch (standard?.toLowerCase()) {
      case 'hipaa': return 'bg-red-50 text-red-600';
      case 'iso27001': return 'bg-amber-50 text-amber-600';
      default: return 'bg-slate-50 text-slate-600';
    }
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const highCount = auditIssues.filter(i => i.severity === 'high').length;
  const medCount = auditIssues.filter(i => i.severity === 'medium').length;
  const lowCount = auditIssues.filter(i => i.severity === 'low').length;

  return (
    <div className="space-y-6">
      {/* Setup Card — matches Recovery Loop "Monitor a Repository" card */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-slate-700 flex items-center gap-2 mb-4">
          <GitBranch size={20} />
          Audit a Repository
        </h2>

        {auditError && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700 flex-1">{auditError}</p>
            <button onClick={() => setAuditError('')} className="text-red-400 hover:text-red-600">
              <X size={14} />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-3">
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Repository URL
            </label>
            <input
              id="repo-audit-url"
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              disabled={isAuditing}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:opacity-50"
            />
          </div>

          <div className="flex flex-col justify-end">
            <button
              id="start-audit-btn"
              onClick={() => startAudit()}
              disabled={isAuditing || !repoUrl.trim()}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {isAuditing ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
              {isAuditing ? 'Auditing...' : 'Start Audit'}
            </button>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      {isAuditing && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-slate-700">
              Scanning <strong>{auditRepoName}</strong>
            </span>
            <span className="text-sm text-slate-500">
              {progress.scanned} / {progress.total} files ({progressPercent}%)
            </span>
          </div>

          <div className="w-full bg-slate-200 rounded-full h-3 mb-2">
            <div
              className="bg-blue-600 h-3 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {progress.currentFile && (
            <div className="text-xs text-slate-400 truncate mt-1">
              Currently scanning: <span className="text-slate-500">{progress.currentFile}</span>
            </div>
          )}

          {auditIssues.length > 0 && (
            <div className="mt-2 text-xs text-slate-500">
              Found {auditIssues.length} issue(s) so far...
            </div>
          )}
        </div>
      )}

      {/* Stats Overview (matches Recovery Loop stat cards) */}
      {auditIssues.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">High Severity</p>
                <p className="text-2xl font-bold text-red-600 mt-1">{highCount}</p>
              </div>
              <AlertTriangle className="text-red-500" size={24} />
            </div>
          </div>
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Medium Severity</p>
                <p className="text-2xl font-bold text-orange-600 mt-1">{medCount}</p>
              </div>
              <AlertTriangle className="text-orange-500" size={24} />
            </div>
          </div>
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Low Severity</p>
                <p className="text-2xl font-bold text-yellow-600 mt-1">{lowCount}</p>
              </div>
              <Info className="text-yellow-500" size={24} />
            </div>
          </div>
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Files Affected</p>
                <p className="text-2xl font-bold text-blue-600 mt-1">{Object.keys(issuesByFile).length}</p>
              </div>
              <FileCode className="text-blue-500" size={24} />
            </div>
          </div>
        </div>
      )}

      {/* Filter + Export Row */}
      {auditIssues.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <select
              value={selectedFilter}
              onChange={(e) => setSelectedFilter(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Standards</option>
              <option value="hipaa">HIPAA</option>
              <option value="iso27001">ISO 27001</option>
              <option value="general">General</option>
            </select>
            {auditRepoName && (
              <span className="text-sm text-slate-500">
                Results for <strong>{auditRepoName}</strong>
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => exportSecurityIssuesCsv(filteredAuditIssues as any)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg hover:bg-slate-100 transition-colors text-slate-600"
            >
              <Download size={14} /> CSV
            </button>
            <button
              onClick={() => exportSecurityIssuesPdf(filteredAuditIssues as any)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download size={14} /> PDF
            </button>
          </div>
        </div>
      )}

      {/* Issues grouped by file (matches Recovery Loop issue panel) */}
      {Object.keys(issuesByFile).length > 0 && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-700 flex items-center gap-2">
              <Shield size={14} className="text-red-500" />
              Scan Issues ({filteredAuditIssues.length})
            </h3>
            <div className="flex items-center gap-3 text-[11px]">
              {highCount > 0 && <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700">{highCount} High</span>}
              {medCount > 0 && <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">{medCount} Medium</span>}
              {lowCount > 0 && <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{lowCount} Low</span>}
            </div>
          </div>
          <div className="max-h-[600px] overflow-y-auto divide-y">
            {Object.entries(issuesByFile)
              .sort((a, b) => b[1].length - a[1].length)
              .map(([file, issues]) => {
                const isExpanded = expandedFiles.has(file);
                const fHigh = issues.filter(i => i.severity === 'high').length;
                const fMed = issues.filter(i => i.severity === 'medium').length;
                const fLow = issues.filter(i => i.severity === 'low').length;

                return (
                  <div key={file}>
                    <button
                      onClick={() => toggleFile(file)}
                      className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 text-left"
                    >
                      {isExpanded ? <ChevronDown size={14} className="text-slate-400 shrink-0" /> : <ChevronRight size={14} className="text-slate-400 shrink-0" />}
                      <FileCode size={14} className="text-slate-500 shrink-0" />
                      <span className="text-sm font-medium text-slate-700 truncate flex-1">{file}</span>
                      <span className="text-[11px] text-slate-400 mr-2">{issues.length} issue(s)</span>
                      <div className="flex gap-1">
                        {fHigh > 0 && <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-medium">{fHigh}H</span>}
                        {fMed > 0 && <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-[10px] font-medium">{fMed}M</span>}
                        {fLow > 0 && <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium">{fLow}L</span>}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="bg-slate-50 divide-y divide-slate-100">
                        {issues.map((issue, idx) => (
                          <div key={`${file}-${idx}`} className="px-6 py-3">
                            <div className="flex items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border ${getSeverityBadge(issue.severity)}`}>
                                    {issue.severity.toUpperCase()}
                                  </span>
                                  {issue.standard && (
                                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${getCategoryBadge(issue.standard)}`}>
                                      {issue.standard}
                                    </span>
                                  )}
                                  {issue.line > 0 && <span className="text-[10px] text-slate-400">Line {issue.line}</span>}
                                </div>
                                <p className="text-sm font-medium text-slate-800 mt-1">{issue.title}</p>
                                {issue.description && <p className="text-xs text-slate-500 mt-0.5">{issue.description}</p>}
                                {issue.code && (
                                  <div className="mt-2">
                                    <span className="text-[10px] text-slate-400 uppercase">Flagged Code</span>
                                    <pre className="mt-0.5 px-2 py-1.5 bg-red-50 border border-red-100 rounded text-xs text-red-800 overflow-x-auto">
                                      {issue.code}
                                    </pre>
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
                                {issue.recommendation && (
                                  <div className="mt-2">
                                    <span className="text-[10px] text-slate-400 uppercase">Suggested Fix</span>
                                    <p className="text-xs text-green-700 mt-0.5">{issue.recommendation}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isAuditing && auditIssues.length === 0 && auditStatus !== 'complete' && (
        <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
          <GitBranch className="mx-auto text-slate-300 mb-4" size={48} />
          <h3 className="text-lg font-semibold text-slate-800 mb-2">No repositories being audited</h3>
          <p className="text-slate-500 max-w-md mx-auto">
            Enter a GitHub repository URL above to start a security audit. It will scan all source files for vulnerabilities, compliance issues, and security risks.
          </p>
          <div className="flex items-center justify-center gap-6 mt-6 text-xs text-slate-400">
            <span className="flex items-center gap-1.5"><Shield size={14} className="text-blue-400" /> Security Scanning</span>
            <span className="flex items-center gap-1.5"><FileCode size={14} className="text-green-400" /> Multi-Language</span>
            <span className="flex items-center gap-1.5"><AlertTriangle size={14} className="text-yellow-400" /> HIPAA & ISO 27001</span>
          </div>
        </div>
      )}

      {/* Completed with no issues */}
      {!isAuditing && auditStatus === 'complete' && auditIssues.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
          <CheckCircle className="mx-auto text-green-500 mb-4" size={48} />
          <h3 className="text-lg font-semibold text-slate-800 mb-2">All Clear!</h3>
          <p className="text-slate-500">No security issues found in {auditRepoName}.</p>
        </div>
      )}

      {/* Bottom: History + Scheduling */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Audit History */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="px-4 py-3 border-b">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <Clock size={14} /> Audit History
            </h3>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {auditHistory.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">No audits yet</p>
            ) : (
              auditHistory.map((item) => (
                <button
                  key={item.id}
                  onClick={() => loadAuditFromHistory(item)}
                  className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b last:border-b-0 flex justify-between items-center transition-colors"
                >
                  <div>
                    <div className="text-sm font-medium text-slate-800">{item.repo_name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {formatDate(item.created_at)} • {item.scanned_files}/{item.total_files} files
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      item.status === 'complete' ? 'bg-green-100 text-green-700'
                        : item.status === 'error' ? 'bg-red-100 text-red-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>{item.status}</span>
                    <div className="flex gap-1">
                      {item.high_count > 0 && <span className="px-1 py-0.5 bg-red-100 text-red-700 rounded text-[10px]">{item.high_count}H</span>}
                      {item.medium_count > 0 && <span className="px-1 py-0.5 bg-yellow-100 text-yellow-700 rounded text-[10px]">{item.medium_count}M</span>}
                      {item.low_count > 0 && <span className="px-1 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px]">{item.low_count}L</span>}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Scheduling */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <Calendar size={14} /> Scheduled Audits
            </h3>
            <button
              onClick={() => setShowSchedule(!showSchedule)}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              {showSchedule ? 'Hide' : 'Add New'}
            </button>
          </div>

          <div className="p-4 space-y-3">
            {showSchedule && (
              <div className="space-y-2 pb-3 border-b">
                <input
                  type="text"
                  value={scheduleRepoUrl}
                  onChange={(e) => setScheduleRepoUrl(e.target.value)}
                  placeholder="owner/repo or full URL"
                  className="w-full px-3 py-1.5 border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex gap-2">
                  <select
                    value={scheduleInterval}
                    onChange={(e) => setScheduleInterval(e.target.value as 'daily' | 'weekly')}
                    className="flex-1 border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                  <button
                    onClick={createSchedule}
                    disabled={!scheduleRepoUrl.trim()}
                    className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:bg-slate-300 transition-colors"
                  >
                    Schedule
                  </button>
                </div>
              </div>
            )}

            {schedules.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">No scheduled audits</p>
            ) : (
              schedules.map((sched) => (
                <div key={sched.id} className="flex items-center justify-between p-2 rounded-lg border text-xs">
                  <div>
                    <div className="font-medium text-slate-700 truncate max-w-[180px]">
                      {sched.repo_url.split('/').slice(-2).join('/')}
                    </div>
                    <div className="text-slate-400 mt-0.5">
                      {sched.interval} • Next: {formatDate(sched.next_run)}
                    </div>
                  </div>
                  <button
                    onClick={() => cancelSchedule(sched.id)}
                    className="text-red-400 hover:text-red-600 p-1 transition-colors"
                    title="Cancel schedule"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RepoSecurityAudit;
