import React, { useState } from 'react';
import { Shield, AlertTriangle, CheckCircle, Filter, Info } from 'lucide-react';
import { useAppContext, SecurityIssue } from '@/context/AppContext';

const SecurityScanner: React.FC = () => {
  const [selectedFilter, setSelectedFilter] = useState('all');
  const { latestReport } = useAppContext();
  
  const securityIssues = latestReport?.securityIssues ?? [];

  const filteredIssues = selectedFilter === 'all' 
    ? securityIssues 
    : securityIssues.filter(issue => issue.standard.toLowerCase() === selectedFilter);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'text-red-600 bg-red-50 border-red-200';
      case 'medium': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'low': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'high': return <AlertTriangle className="text-red-500" size={16} />;
      case 'medium': return <AlertTriangle className="text-orange-500" size={16} />;
      case 'low': return <Info className="text-yellow-500" size={16} />;
      default: return <CheckCircle className="text-gray-500" size={16} />;
    }
  };

  if (!latestReport) {
     return (
      <div className="p-6 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Shield className="mx-auto text-gray-400 mb-4" size={48} />
          <h2 className="text-2xl font-bold text-gray-700">No Security Scan Data</h2>
          <p className="text-gray-500 mt-2">Convert a file to see the security analysis.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Shield className="text-blue-600" size={28} />
            <h2 className="text-3xl font-bold text-gray-900">Security Scanner</h2>
          </div>
          
          <div className="flex items-center gap-3">
            <Filter size={16} className="text-gray-500" />
            <select 
              value={selectedFilter}
              onChange={(e) => setSelectedFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Standards</option>
              <option value="hipaa">HIPAA Only</option>
              <option value="iso27001">ISO 27001 Only</option>
              <option value="general">General Security</option>
            </select>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-2xl font-bold text-red-600">
              {securityIssues.filter(i => i.severity === 'high').length}
            </div>
            <div className="text-sm text-gray-600">High Severity</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-2xl font-bold text-orange-600">
              {securityIssues.filter(i => i.severity === 'medium').length}
            </div>
            <div className="text-sm text-gray-600">Medium Severity</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-2xl font-bold text-yellow-600">
              {securityIssues.filter(i => i.severity === 'low').length}
            </div>
            <div className="text-sm text-gray-600">Low Severity</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-2xl font-bold text-blue-600">
              {securityIssues.length}
            </div>
            <div className="text-sm text-gray-600">Total Issues</div>
          </div>
        </div>

        {/* Issues List */}
        <div className="space-y-4">
          {filteredIssues.map((issue) => (
            <div key={issue.id} className="bg-white rounded-lg shadow-sm border">
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {getSeverityIcon(issue.severity)}
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{issue.title}</h3>
                      <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
                        <span>{issue.file}:{issue.line}</span>
                        <span className={`px-2 py-1 rounded text-xs border ${getSeverityColor(issue.severity)}`}>
                          {issue.severity.toUpperCase()}
                        </span>
                        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                          {issue.standard}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Issue Description</h4>
                    <p className="text-gray-700 text-sm">{issue.description}</p>
                  </div>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                        <AlertTriangle size={16} className="text-red-500" />
                        Flagged Code
                      </h4>
                      <div className="bg-gray-900 text-red-400 p-3 rounded font-mono text-sm border-l-4 border-red-500">
                        {issue.code}
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                        <CheckCircle size={16} className="text-green-500" />
                        Recommended Code
                      </h4>
                      <div className="bg-gray-900 text-green-400 p-3 rounded font-mono text-sm border-l-4 border-green-500">
                        {issue.recommended_code || "No specific code recommendation available"}
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">General Recommendation</h4>
                    <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                      <p className="text-blue-800 text-sm">{issue.recommendation}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredIssues.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
            <CheckCircle className="mx-auto text-green-500 mb-4" size={48} />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Issues Found</h3>
            <p className="text-gray-600">All security scans passed for the selected filter.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SecurityScanner;