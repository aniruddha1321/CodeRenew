import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileCode,
  Clock,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  Shield,
} from "lucide-react";
import { useAppContext } from "@/context/AppContext";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
  Legend,
} from "recharts";

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

  // Process data for the chart
  const chartData = useMemo(() => {
    if (reports.length === 0) return [];

    // Group reports by date (day)
    const groupedByDate = reports.reduce((acc, report) => {
      const dateKey = report.timestamp.toLocaleDateString();
      
      if (!acc[dateKey]) {
        acc[dateKey] = {
          date: dateKey,
          timestamp: report.timestamp,
          total: 0,
          successful: 0,
          hasHighSeverity: false,
          hasMediumSeverity: false,
          securityIssues: 0,
        };
      }
      
      acc[dateKey].total += 1;
      if (report.success) acc[dateKey].successful += 1;
      acc[dateKey].securityIssues += report.securityIssues.length;
      
      // Check for security severity levels
      if (report.securityIssues.some(issue => issue.severity === 'high')) {
        acc[dateKey].hasHighSeverity = true;
      }
      if (report.securityIssues.some(issue => issue.severity === 'medium')) {
        acc[dateKey].hasMediumSeverity = true;
      }
      
      return acc;
    }, {} as Record<string, any>);

    // Convert to array and calculate success rate
    const data = Object.values(groupedByDate)
      .map((day: any) => ({
        ...day,
        successRate: (day.successful / day.total) * 100,
      }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return data;
  }, [reports]);

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border rounded-lg shadow-lg">
          <p className="font-semibold text-sm">{label}</p>
          <p className="text-sm text-gray-600">
            Success Rate: <span className="font-semibold text-green-600">{data.successRate.toFixed(1)}%</span>
          </p>
          <p className="text-sm text-gray-600">
            Conversions: {data.successful}/{data.total}
          </p>
          {data.securityIssues > 0 && (
            <p className="text-sm text-orange-600">
              Security Issues: {data.securityIssues}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  // Custom dot component for security markers
  const SecurityMarker = (props: any) => {
    const { cx, cy, payload } = props;
    
    if (payload.hasHighSeverity) {
      return (
        <g>
          <circle cx={cx} cy={cy - 10} r={8} fill="#dc2626" opacity={0.8} />
          <text x={cx} y={cy - 7} textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">!</text>
        </g>
      );
    } else if (payload.hasMediumSeverity) {
      return (
        <g>
          <circle cx={cx} cy={cy - 10} r={6} fill="#f59e0b" opacity={0.8} />
        </g>
      );
    }
    return null;
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-3xl font-bold text-gray-900 mb-8">Dashboard</h2>

        {/* API Connectivity Banner */}
        {(!apiConnectivity.isConnected || !apiConnectivity.groqConfigured) && (
          <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="text-orange-500" size={20} />
                <div>
                  <h3 className="font-semibold text-orange-800">API Connection Required</h3>
                  <p className="text-sm text-orange-700">
                    Configure your Groq API key to start converting Python 2 code to Python 3.
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
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

          <div className="bg-white p-6 rounded-lg shadow-sm border">
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

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Quick Start
            </h3>
            <div className="space-y-3">
              <button
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
                onClick={() => navigate("/workspace")}
              >
                Convert New Files
              </button>
              <button
                className="w-full border border-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-50 transition-colors"
                onClick={() => navigate("/workspace")}
              >
                View Last Conversion
              </button>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
            <div className="space-y-3 text-sm">
              {reports.slice(0, 3).map(report => (
                <div key={report.id} className="flex items-center gap-3">
                  {report.success ? <CheckCircle size={16} className="text-green-500" /> : <AlertTriangle size={16} className="text-red-500" />}
                  <span className="text-gray-600">
                    Conversion {report.success ? 'succeeded' : 'failed'} at {report.timestamp.toLocaleTimeString()}
                  </span>
                </div>
              ))}
              {reports.length === 0 && <p className="text-gray-500">No activity yet.</p>}
            </div>
          </div>
        </div>

        {/* Conversion Trends Chart */}
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Conversion Trends
            </h3>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-blue-500 rounded"></div>
                <span className="text-gray-600">Success Rate</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <span className="text-gray-600">High Security</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                <span className="text-gray-600">Medium Security</span>
              </div>
            </div>
          </div>
          
          {chartData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => {
                      const date = new Date(value);
                      return `${date.getMonth() + 1}/${date.getDate()}`;
                    }}
                  />
                  <YAxis 
                    domain={[0, 100]}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="successRate"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ fill: '#3b82f6', r: 4 }}
                    activeDot={{ r: 6 }}
                    name="Success Rate"
                  />
                  {/* Add security markers */}
                  {chartData.map((entry, index) => (
                    <SecurityMarker
                      key={index}
                      cx={0}
                      cy={0}
                      payload={entry}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 bg-gray-100 rounded-lg flex items-center justify-center">
              <div className="text-center text-gray-500">
                <TrendingUp size={48} className="mx-auto mb-2" />
                <p>No conversion data available yet</p>
                <p className="text-sm mt-1">Start converting files to see trends</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;