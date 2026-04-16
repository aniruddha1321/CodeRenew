import React, { useState } from 'react';
import { Shield, FileText, GitBranch } from 'lucide-react';
import FileSecurityScan from './FileSecurityScan';
import RepoSecurityAudit from './RepoSecurityAudit';

type TabId = 'file-scan' | 'repo-audit';

const SecurityScanner: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('file-scan');

  const tabs = [
    { id: 'file-scan' as TabId, label: 'File Scan', icon: FileText },
    { id: 'repo-audit' as TabId, label: 'Repo Audit', icon: GitBranch },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header row — title left, tabs right */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Shield className="text-blue-600" size={28} />
            Security Scanner
          </h1>
          <p className="text-slate-500 mt-1">
            Scan files and audit repositories for security vulnerabilities &amp; compliance issues
          </p>
        </div>

        {/* Tabs — top right */}
        <div className="flex gap-1 bg-white rounded-lg p-1 shadow-sm border">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Icon size={15} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'file-scan' && <FileSecurityScan />}
      {activeTab === 'repo-audit' && <RepoSecurityAudit />}
    </div>
  );
};

export default SecurityScanner;