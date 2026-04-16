import React from "react";
import { useNavigate } from "react-router-dom";
import {
  FileCode,
  Clock,
  CheckCircle,
  AlertTriangle,
  Download,
  Shield,
  ArrowRight,
  GitBranch,
  Activity,
} from "lucide-react";
import { useAppContext } from "@/context/AppContext";
import { exportReportsCsv, exportReportsPdf } from "@/lib/exportUtils";
import ApiHealthBadge from "./ApiHealthBadge";


const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { reports, apiConnectivity } = useAppContext();

  const totalFiles = reports.reduce((sum, report) => sum + (report.filesCount || 1), 0);
  const successfulConversions = reports.reduce((sum, report) => 
    sum + (report.success ? (report.filesCount || 1) : 0), 0
  );
  const successRate =
    totalFiles > 0
      ? ((successfulConversions / totalFiles) * 100).toFixed(1)
      : "0.0";
  const totalSecurityIssues = reports.reduce(
    (acc, r) => acc + r.securityIssues.length,
    0
  );
  const avgTime =
    totalFiles > 0
      ? (
          reports.reduce((acc, r) => acc + r.executionTime, 0) /
          totalFiles /
          1000
        ).toFixed(1)
      : "0.0";

  // Security breakdown from all reports
  const allSecurityIssues = reports.flatMap(r => r.securityIssues);
  const highCount = allSecurityIssues.filter(i => i.severity === "high").length;
  const medCount = allSecurityIssues.filter(i => i.severity === "medium").length;
  const lowCount = allSecurityIssues.filter(i => i.severity === "low").length;

  // Standards breakdown
  const hipaaCount = allSecurityIssues.filter(i => i.standard?.toLowerCase() === "hipaa").length;
  const isoCount = allSecurityIssues.filter(i => i.standard?.toLowerCase() === "iso27001").length;
  const generalCount = allSecurityIssues.filter(i => i.standard?.toLowerCase() === "general").length;

  return (
    <div className="px-8 pb-8 pt-5 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-3xl font-bold text-gray-900">Dashboard</h2>
          <div className="flex items-center gap-4">
            <ApiHealthBadge />
            {reports.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportReportsCsv(reports)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
                >
                  <Download size={14} /> CSV
                </button>
                <button
                  onClick={() => exportReportsPdf(reports)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Download size={14} /> PDF
                </button>
              </div>
            )}
          </div>
        </div>

        {/* API Connectivity Banner */}
        {(!apiConnectivity.isConnected || !apiConnectivity.groqConfigured) && (
          <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="text-orange-500" size={20} />
                <div>
                  <h3 className="font-semibold text-orange-800">API Connection Required</h3>
                  <p className="text-sm text-orange-700">
                    Configure your Groq API key to start converting code.
                  </p>
                </div>
              </div>
              <button
                onClick={() => navigate("/settings")}
                className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors"
              >
                Configure API
              </button>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Files Converted</p>
                <p className="text-2xl font-bold text-gray-900">{totalFiles}</p>
              </div>
              <FileCode className="text-blue-500" size={24} />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Success Rate</p>
                <p className="text-2xl font-bold text-green-600">
                  {successRate}%
                </p>
              </div>
              <CheckCircle className="text-green-500" size={24} />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border cursor-pointer hover:border-orange-300 transition-colors"
               onClick={() => navigate("/security")}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Security Issues</p>
                <p className="text-2xl font-bold text-orange-600">
                  {totalSecurityIssues}
                </p>
              </div>
              <AlertTriangle className="text-orange-500" size={24} />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Avg. Time</p>
                <p className="text-2xl font-bold text-gray-900">{avgTime}s</p>
              </div>
              <Clock className="text-purple-500" size={24} />
            </div>
          </div>
        </div>

        {/* Middle row: Quick Start + Security Overview + Recent Activity */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {/* Quick Start */}
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Quick Start
            </h3>
            <div className="space-y-3">
              <button
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                onClick={() => navigate("/workspace")}
              >
                <FileCode size={16} /> Convert New Files
              </button>
              <button
                className="w-full border border-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                onClick={() => navigate("/clone-convert")}
              >
                <GitBranch size={16} /> Clone & Convert Repo
              </button>
              <button
                className="w-full border border-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                onClick={() => navigate("/security")}
              >
                <Shield size={16} /> Security Scanner
              </button>
            </div>
          </div>

          {/* Security Overview */}
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Security Overview</h3>
              {totalSecurityIssues > 0 && (
                <button
                  onClick={() => navigate("/security")}
                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  View All <ArrowRight size={12} />
                </button>
              )}
            </div>

            {totalSecurityIssues > 0 ? (
              <div className="space-y-3">
                {/* Severity bars */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">High</span>
                    <span className="font-medium text-red-600">{highCount}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="bg-red-500 h-2 rounded-full transition-all" style={{ width: `${totalSecurityIssues > 0 ? (highCount / totalSecurityIssues) * 100 : 0}%` }} />
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Medium</span>
                    <span className="font-medium text-orange-600">{medCount}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="bg-orange-500 h-2 rounded-full transition-all" style={{ width: `${totalSecurityIssues > 0 ? (medCount / totalSecurityIssues) * 100 : 0}%` }} />
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Low</span>
                    <span className="font-medium text-yellow-600">{lowCount}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="bg-yellow-500 h-2 rounded-full transition-all" style={{ width: `${totalSecurityIssues > 0 ? (lowCount / totalSecurityIssues) * 100 : 0}%` }} />
                  </div>
                </div>

                {/* Standards pills */}
                <div className="flex gap-2 pt-1">
                  {hipaaCount > 0 && <span className="px-2 py-1 bg-red-50 text-red-700 rounded text-xs">{hipaaCount} HIPAA</span>}
                  {isoCount > 0 && <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded text-xs">{isoCount} ISO 27001</span>}
                  {generalCount > 0 && <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs">{generalCount} General</span>}
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <Shield className="mx-auto text-gray-300 mb-2" size={32} />
                <p className="text-sm text-gray-500">No security data yet</p>
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
            <div className="space-y-3 text-sm">
              {reports.slice(0, 5).map(report => (
                <div key={report.id} className="flex items-start gap-3">
                  {report.success
                    ? <CheckCircle size={16} className="text-green-500 mt-0.5 shrink-0" />
                    : <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
                  }
                  <div className="min-w-0 flex-1">
                    <div className="text-gray-800 truncate">
                      {report.originalFilename || 'Conversion'}
                    </div>
                    <div className="text-xs text-gray-400 flex items-center gap-2">
                      <span>{report.timestamp.toLocaleTimeString()}</span>
                      {report.securityIssues.length > 0 && (
                        <span className="text-orange-500">{report.securityIssues.length} issues</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {reports.length === 0 && <p className="text-gray-500">No activity yet.</p>}
            </div>
          </div>
        </div>

        {/* Conversion History Table */}
        {reports.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Activity size={18} />
                Conversion History
              </h3>
              <span className="text-xs text-gray-400">{reports.length} conversion(s)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">File</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Mode</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Security</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {reports.slice(0, 10).map(report => (
                    <tr key={report.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 text-gray-800 font-medium truncate max-w-[200px]">
                        {report.originalFilename || '—'}
                      </td>
                      <td className="px-6 py-3">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
                          {report.conversionMode || 'py2to3'}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        {report.success
                          ? <span className="flex items-center gap-1 text-green-600"><CheckCircle size={14} /> Success</span>
                          : <span className="flex items-center gap-1 text-red-600"><AlertTriangle size={14} /> Failed</span>
                        }
                      </td>
                      <td className="px-6 py-3">
                        {report.securityIssues.length > 0 ? (
                          <span className="text-orange-600 font-medium">{report.securityIssues.length} issue(s)</span>
                        ) : (
                          <span className="text-green-600 text-xs">Clean</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-gray-500">
                        {(report.executionTime / 1000).toFixed(1)}s
                      </td>
                      <td className="px-6 py-3 text-gray-400 text-xs">
                        {report.timestamp.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;