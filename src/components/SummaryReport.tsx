import React, { useMemo } from 'react';
import { Download, FileText, CheckCircle, AlertTriangle, Clock, FileCode, ChevronRight } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';

const SummaryReport: React.FC = () => {
  const { reports } = useAppContext();

  // Function to clean markdown formatting from text
  const cleanMarkdown = (text: string): string => {
    return text
      // Remove markdown links [text](url) -> text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove backticks for inline code
      .replace(/`([^`]+)`/g, '$1')
      // Remove bold/italic markers
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      // Remove bullet point markers at the start
      .replace(/^\*+\s*/, '')
      .replace(/^-+\s*/, '')
      .replace(/^\d+\.\s*/, '')
      // Clean up extra whitespace
      .trim();
  };

  // Function to extract and prioritize key changes from explanation text
  const extractKeyChanges = (explanation: string): string[] => {
    const lines = explanation.split('\n').filter(line => line.trim());
    const keyChanges: string[] = [];

    // Priority patterns for most important changes
    const priorityPatterns = [
      /type (hints|annotations)/i,
      /print\s*(statement|function)/i,
      /unicode|string/i,
      /import/i,
      /exception|error handling/i,
      /division|operator/i,
      /input\(\)|raw_input/i,
      /dict\.|\.keys\(\)|\.values\(\)|\.items\(\)/i,
      /range|xrange/i,
      /async|await/i,
      /f-string|format/i,
      /walrus operator|:=/i,
    ];

    // First pass: Look for lines with priority patterns
    for (const line of lines) {
      const cleanLine = cleanMarkdown(line);
      if (!cleanLine) continue;

      for (const pattern of priorityPatterns) {
        if (pattern.test(cleanLine) && keyChanges.length < 2) {
          keyChanges.push(cleanLine);
          break;
        }
      }
    }

    // Second pass: If we don't have enough key changes, take any bullet points
    if (keyChanges.length < 2) {
      for (const line of lines) {
        if ((line.startsWith('*') || line.startsWith('-') || /^\d+\./.test(line)) && keyChanges.length < 2) {
          const cleanLine = cleanMarkdown(line);
          if (cleanLine && !keyChanges.includes(cleanLine)) {
            keyChanges.push(cleanLine);
          }
        }
      }
    }

    // Third pass: If still not enough, take any substantial line
    if (keyChanges.length < 2) {
      for (const line of lines) {
        const cleanLine = cleanMarkdown(line);
        if (cleanLine.length > 20 && keyChanges.length < 2 && !keyChanges.includes(cleanLine)) {
          keyChanges.push(cleanLine);
        }
      }
    }

    return keyChanges.slice(0, 2); // Maximum 2 changes per conversion
  };

  // Process all reports to extract major changes
  const majorChangesData = useMemo(() => {
    if (reports.length === 0) return [];

    // Get up to 5 most recent reports
    const recentReports = reports.slice(0, 5);

    return recentReports.map(report => ({
      id: report.id,
      timestamp: report.timestamp,
      success: report.success,
      changes: extractKeyChanges(report.explanation),
      hasSecurityIssues: report.securityIssues.length > 0,
      highSeverityCount: report.securityIssues.filter(i => i.severity === 'high').length,
    }));
  }, [reports]);

  const latestReport = reports[0];

  if (!latestReport) {
    return (
      <div className="p-6 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <FileText className="mx-auto text-gray-400 mb-4" size={48} />
          <h2 className="text-2xl font-bold text-gray-700">No Report Generated</h2>
          <p className="text-gray-500 mt-2">Please convert a file in the workspace to see a summary.</p>
        </div>
      </div>
    );
  }

  const totalFiles = reports.reduce((sum, report) => sum + (report.filesCount || 1), 0);
  const successfulConversions = reports.reduce((sum, report) =>
    sum + (report.success ? (report.filesCount || 1) : 0), 0
  );
  const failedConversions = reports.reduce((sum, report) =>
    sum + (report.success ? 0 : (report.filesCount || 1)), 0
  );

  const reportData = {
    timestamp: latestReport.timestamp.toLocaleString(),
    totalFiles: totalFiles,
    successfulConversions: successfulConversions,
    failedConversions: failedConversions,
    executionTime: `${(latestReport.executionTime / 1000).toFixed(2)} seconds`,
    avgExecutionTime: `${(reports.reduce((acc, r) => acc + r.executionTime, 0) / reports.length / 1000).toFixed(2)} seconds`,
    securityIssues: {
      high: reports.reduce((acc, r) => acc + r.securityIssues.filter(i => i.severity === 'high').length, 0),
      medium: reports.reduce((acc, r) => acc + r.securityIssues.filter(i => i.severity === 'medium').length, 0),
      low: reports.reduce((acc, r) => acc + r.securityIssues.filter(i => i.severity === 'low').length, 0),
    },
  };

  const successRate = reportData.totalFiles > 0
    ? ((reportData.successfulConversions / reportData.totalFiles) * 100).toFixed(1)
    : "0.0";

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <FileText className="text-blue-600" size={28} />
            <h2 className="text-3xl font-bold text-gray-900">Conversion Summary</h2>
          </div>
        </div>

        {/* Overview Card */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">Conversion Overview</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <FileCode className="mx-auto text-blue-600 mb-2" size={24} />
              <div className="text-2xl font-bold text-blue-600">{reportData.totalFiles}</div>
              <div className="text-sm text-gray-600">Total Files</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <CheckCircle className="mx-auto text-green-600 mb-2" size={24} />
              <div className="text-2xl font-bold text-green-600">{successRate}%</div>
              <div className="text-sm text-gray-600">Success Rate</div>
            </div>
            <div className="text-center p-4 bg-orange-50 rounded-lg">
              <AlertTriangle className="mx-auto text-orange-600 mb-2" size={24} />
              <div className="text-2xl font-bold text-orange-600">{Object.values(reportData.securityIssues).reduce((a, b) => a + b, 0)}</div>
              <div className="text-sm text-gray-600">Security Issues</div>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <Clock className="mx-auto text-purple-600 mb-2" size={24} />
              <div className="text-2xl font-bold text-purple-600">{reportData.avgExecutionTime}</div>
              <div className="text-sm text-gray-600">Avg. Time</div>
            </div>
          </div>
        </div>

        {/* Detailed Results */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Conversion Results */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Conversion Results</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle className="text-green-600" size={16} />
                  <span className="text-green-800">Successful Conversions</span>
                </div>
                <span className="font-semibold text-green-600">{reportData.successfulConversions}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="text-red-600" size={16} />
                  <span className="text-red-800">Failed Conversions</span>
                </div>
                <span className="font-semibold text-red-600">{reportData.failedConversions}</span>
              </div>
            </div>
          </div>

          {/* Security Summary */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Security Issues</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                <span className="text-red-800">High Severity</span>
                <span className="font-semibold text-red-600">{reportData.securityIssues.high}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                <span className="text-orange-800">Medium Severity</span>
                <span className="font-semibold text-orange-600">{reportData.securityIssues.medium}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                <span className="text-yellow-800">Low Severity</span>
                <span className="font-semibold text-yellow-600">{reportData.securityIssues.low}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Major Changes Applied */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Major Changes Applied</h3>
          {majorChangesData.length > 0 ? (
            <div className="space-y-4">
              {majorChangesData.map((report, reportIndex) => (
                <div key={report.id} className="border-l-4 border-blue-200 pl-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700">
                        Conversion #{reports.length - reportIndex}
                      </span>
                      <span className="text-xs text-gray-500">
                        {report.timestamp.toLocaleString()}
                      </span>
                      {report.hasSecurityIssues && report.highSeverityCount > 0 && (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                          {report.highSeverityCount} security issues
                        </span>
                      )}
                    </div>
                    {report.success ? (
                      <CheckCircle className="text-green-500" size={16} />
                    ) : (
                      <AlertTriangle className="text-red-500" size={16} />
                    )}
                  </div>
                  {report.changes.length > 0 ? (
                    <div className="space-y-2">
                      {report.changes.map((change, changeIndex) => (
                        <div key={changeIndex} className="flex items-start gap-2">
                          <ChevronRight className="text-gray-400 mt-0.5 flex-shrink-0" size={14} />
                          <p className="text-sm text-gray-700 leading-relaxed">{change}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 italic">No major changes documented</p>
                  )}
                </div>
              ))}

              {reports.length > 5 && (
                <div className="text-center pt-2">
                  <p className="text-sm text-gray-500">
                    Showing recent {majorChangesData.length} of {reports.length} conversions
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-gray-500">No conversion changes to display</p>
            </div>
          )}
        </div>

        {/* Report Metadata */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Report Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Last Updated:</span>
              <span className="ml-2 font-medium">{latestReport.timestamp.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-gray-600">AI Model:</span>
              <span className="ml-2 font-medium">Llama 3.3 70B</span>
            </div>
            <div>
              <span className="text-gray-600">Version:</span>
              <span className="ml-2 font-medium">Code Renew v1.0.0</span>
            </div>
            <div>
              <span className="text-gray-600">Compliance Standards:</span>
              <span className="ml-2 font-medium">HIPAA, ISO 27001</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SummaryReport;