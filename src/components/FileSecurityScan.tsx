import React, { useState, useRef, useEffect } from 'react';
import {
  Shield, AlertTriangle, CheckCircle, Filter, Info, Download,
  Upload, Loader2, ChevronDown, ChevronRight, History, FileCode, Zap
} from 'lucide-react';
import { useAppContext, SecurityIssue } from '@/context/AppContext';
import { exportSecurityIssuesCsv, exportSecurityIssuesPdf } from '@/lib/exportUtils';

interface ScanHistoryItem {
  id: string;
  created_at: string;
  filenames: string[];
  total_issues: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  scan_type: string;
}

const FileSecurityScan: React.FC = () => {
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [activeSection, setActiveSection] = useState<'conversion' | 'standalone'>('conversion');
  const { latestReport } = useAppContext();

  const [standaloneFiles, setStandaloneFiles] = useState<Record<string, string>>({});
  const [standaloneResults, setStandaloneResults] = useState<Record<string, SecurityIssue[]>>({});
  const [isScanning, setIsScanning] = useState(false);
  const [scanHistory, setScanHistory] = useState<ScanHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchHistory(); }, []);

  const fetchHistory = async () => {
    try {
      const res = await fetch('http://127.0.0.1:5000/api/security/history?type=files');
      const data = await res.json();
      if (data.success && data.file_scans) setScanHistory(data.file_scans);
    } catch { /* ignore */ }
  };

  const conversionIssues = latestReport?.securityIssues ?? [];
  const standaloneIssues: SecurityIssue[] = Object.values(standaloneResults).flat();
  const currentIssues = activeSection === 'conversion' ? conversionIssues : standaloneIssues;
  const filteredIssues = selectedFilter === 'all'
    ? currentIssues
    : currentIssues.filter(issue => issue.standard.toLowerCase() === selectedFilter);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) return;
    const files: Record<string, string> = {};
    for (const file of Array.from(fileList)) {
      files[file.name] = await file.text();
    }
    setStandaloneFiles(prev => ({ ...prev, ...files }));
  };

  const runStandaloneScan = async () => {
    if (Object.keys(standaloneFiles).length === 0) return;
    setIsScanning(true);
    setActiveSection('standalone');
    try {
      const res = await fetch('http://127.0.0.1:5000/api/security/scan-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: standaloneFiles }),
      });
      const data = await res.json();
      if (data.success) { setStandaloneResults(data.results); fetchHistory(); }
    } catch (err) { console.error('Scan failed:', err); }
    finally { setIsScanning(false); }
  };

  const loadHistoryScan = async (scanId: string) => {
    try {
      const res = await fetch(`http://127.0.0.1:5000/api/security/scan-detail?scan_id=${scanId}`);
      const data = await res.json();
      if (data.success && data.results) {
        setStandaloneResults(data.results);
        setActiveSection('standalone');
        setShowHistory(false);
      }
    } catch { /* ignore */ }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'text-red-600 bg-red-50 border-red-200';
      case 'medium': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'low': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      default: return 'text-slate-600 bg-slate-50 border-slate-200';
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const highCount = currentIssues.filter(i => i.severity === 'high').length;
  const medCount = currentIssues.filter(i => i.severity === 'medium').length;
  const lowCount = currentIssues.filter(i => i.severity === 'low').length;

  return (
    <div className="space-y-6">
      {/* ─── Setup Card (mirrors Recovery Loop "Monitor a Repository") ─── */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-slate-700 flex items-center gap-2 mb-4">
          <FileCode size={20} />
          Scan Source Files
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Scan Mode — col-span-2 like Recovery Loop's "Repository URL" */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-600 mb-1">Scan Mode</label>
            <select
              value={activeSection}
              onChange={(e) => setActiveSection(e.target.value as 'conversion' | 'standalone')}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="conversion">From Conversion Results ({conversionIssues.length} issues)</option>
              <option value="standalone">Standalone File Scan ({standaloneIssues.length} issues)</option>
            </select>
          </div>

          {activeSection === 'standalone' ? (
            <>
              {/* Upload — 1 col like Recovery Loop's "Poll Interval" */}
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Upload Files</label>
                <input ref={fileInputRef} type="file" multiple
                  accept=".py,.java,.js,.ts,.cpp,.cs,.rb,.jsx,.tsx"
                  onChange={handleFileUpload} className="hidden" />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full px-3 py-2 border rounded-lg text-sm text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-colors text-left"
                >
                  {Object.keys(standaloneFiles).length > 0
                    ? `${Object.keys(standaloneFiles).length} file(s) selected`
                    : 'Choose files...'}
                </button>
              </div>

              {/* Scan Button — 1 col like Recovery Loop's "Start Monitoring" */}
              <div className="flex flex-col justify-end">
                <button
                  onClick={runStandaloneScan}
                  disabled={isScanning || Object.keys(standaloneFiles).length === 0}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {isScanning ? <Loader2 size={16} className="animate-spin" /> : <Shield size={16} />}
                  {isScanning ? 'Scanning...' : 'Run Security Scan'}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Filter — 1 col */}
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Standard</label>
                <select
                  value={selectedFilter}
                  onChange={(e) => setSelectedFilter(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="all">All Standards</option>
                  <option value="hipaa">HIPAA Only</option>
                  <option value="iso27001">ISO 27001 Only</option>
                  <option value="general">General Security</option>
                </select>
              </div>

              {/* Export — 1 col */}
              <div className="flex flex-col justify-end">
                <div className="flex gap-2">
                  <button
                    onClick={() => exportSecurityIssuesCsv(filteredIssues)}
                    disabled={filteredIssues.length === 0}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium border rounded-lg hover:bg-slate-100 disabled:opacity-40 transition-colors text-slate-600"
                  >
                    <Download size={14} /> CSV
                  </button>
                  <button
                    onClick={() => exportSecurityIssuesPdf(filteredIssues)}
                    disabled={filteredIssues.length === 0}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
                  >
                    <Download size={14} /> PDF
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Checkbox row — mirrors Recovery Loop's "Auto-fix" checkbox */}
        <div className="mt-3 flex items-center gap-4">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-blue-600 transition-colors"
          >
            <History size={14} />
            <span>View scan history ({scanHistory.length})</span>
          </button>
        </div>
      </div>

      {/* History Panel */}
      {showHistory && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="px-4 py-3 border-b">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <History size={14} /> Scan History
            </h3>
          </div>
          <div className="max-h-60 overflow-y-auto divide-y">
            {scanHistory.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">No scan history yet</p>
            ) : (
              scanHistory.map((item) => (
                <button
                  key={item.id}
                  onClick={() => loadHistoryScan(item.id)}
                  className="w-full text-left px-4 py-3 hover:bg-slate-50 flex justify-between items-center transition-colors"
                >
                  <div>
                    <div className="text-sm font-medium text-slate-700 truncate max-w-[300px]">
                      {item.filenames.slice(0, 3).join(', ')}
                      {item.filenames.length > 3 && ` +${item.filenames.length - 3}`}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">{formatDate(item.created_at)}</div>
                  </div>
                  <div className="flex gap-1.5">
                    {item.high_count > 0 && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-medium">{item.high_count} High</span>}
                    {item.medium_count > 0 && <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px] font-medium">{item.medium_count} Med</span>}
                    {item.low_count > 0 && <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded text-[10px] font-medium">{item.low_count} Low</span>}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* ─── Stats Cards (mirrors Recovery Loop stat cards) ─── */}
      {currentIssues.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">High Severity</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{highCount}</p>
              </div>
              <AlertTriangle className="text-red-500" size={24} />
            </div>
          </div>
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Medium Severity</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{medCount}</p>
              </div>
              <AlertTriangle className="text-orange-500" size={24} />
            </div>
          </div>
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Low Severity</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{lowCount}</p>
              </div>
              <Info className="text-yellow-500" size={24} />
            </div>
          </div>
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Issues</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{currentIssues.length}</p>
              </div>
              <Shield className="text-blue-500" size={24} />
            </div>
          </div>
        </div>
      )}

      {/* ─── Issues Panel (mirrors Recovery Loop issues panel) ─── */}
      {filteredIssues.length > 0 && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-700 flex items-center gap-2">
              <Shield size={14} className="text-red-500" />
              Scan Issues ({filteredIssues.length})
            </h3>
            <div className="flex items-center gap-3 text-[11px]">
              {highCount > 0 && <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700">{highCount} High</span>}
              {medCount > 0 && <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">{medCount} Medium</span>}
              {lowCount > 0 && <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{lowCount} Low</span>}
            </div>
          </div>
          <div className="max-h-[600px] overflow-y-auto divide-y">
            {filteredIssues.map((issue) => (
              <div key={issue.id} className="px-6 py-4">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border ${getSeverityColor(issue.severity)}`}>
                        {issue.severity.toUpperCase()}
                      </span>
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600">
                        {issue.standard}
                      </span>
                      <span className="text-[10px] text-slate-400">{issue.file}:{issue.line}</span>
                    </div>
                    <p className="text-sm font-medium text-slate-800 mt-1">{issue.title}</p>
                    {issue.description && <p className="text-xs text-slate-500 mt-0.5">{issue.description}</p>}

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
                      {issue.code && (
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase">Flagged Code</span>
                          <pre className="mt-0.5 px-2 py-1.5 bg-red-50 border border-red-100 rounded text-xs text-red-800 overflow-x-auto">
                            {issue.code}
                          </pre>
                        </div>
                      )}
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase">Recommended Code</span>
                        <pre className="mt-0.5 px-2 py-1.5 bg-green-50 border border-green-100 rounded text-xs text-green-800 overflow-x-auto">
                          {issue.recommended_code || 'No specific recommendation'}
                        </pre>
                      </div>
                    </div>

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
        </div>
      )}

      {/* ─── Empty State (mirrors Recovery Loop empty state) ─── */}
      {filteredIssues.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
          {activeSection === 'conversion' && !latestReport ? (
            <>
              <Shield className="mx-auto text-slate-300 mb-4" size={48} />
              <h3 className="text-lg font-semibold text-slate-800 mb-2">No conversion scan data</h3>
              <p className="text-slate-500 max-w-md mx-auto">
                Convert a file first to see security analysis, or switch to <strong>Standalone File Scan</strong> mode to upload and scan files directly.
              </p>
              <div className="flex items-center justify-center gap-6 mt-6 text-xs text-slate-400">
                <span className="flex items-center gap-1.5"><Shield size={14} className="text-blue-400" /> HIPAA</span>
                <span className="flex items-center gap-1.5"><FileCode size={14} className="text-green-400" /> ISO 27001</span>
                <span className="flex items-center gap-1.5"><AlertTriangle size={14} className="text-yellow-400" /> General Security</span>
              </div>
            </>
          ) : (
            <>
              <CheckCircle className="mx-auto text-green-500 mb-4" size={48} />
              <h3 className="text-lg font-semibold text-slate-800 mb-2">No Issues Found</h3>
              <p className="text-slate-500">All security scans passed for the selected filter.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default FileSecurityScan;
