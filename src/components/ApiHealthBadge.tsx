import React, { useEffect, useState } from "react";
import { Activity, AlertCircle, CheckCircle } from "lucide-react";
import { useAppContext } from "@/context/AppContext";

const ApiHealthBadge: React.FC = () => {
  const { apiConnectivity } = useAppContext();
  const [formattedTime, setFormattedTime] = useState<string>("");

  useEffect(() => {
    if (apiConnectivity.lastChecked) {
      const date = new Date(apiConnectivity.lastChecked);
      setFormattedTime(date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    }
  }, [apiConnectivity.lastChecked]);

  if (apiConnectivity.isChecking) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-full border border-gray-300">
        <Activity size={14} className="text-gray-500 animate-spin" />
        <span className="text-xs font-medium text-gray-600">Checking...</span>
      </div>
    );
  }

  if (apiConnectivity.isConnected && apiConnectivity.groqConfigured) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-full border border-green-200">
        <CheckCircle size={14} className="text-green-600" />
        <span className="text-xs font-medium text-green-700">API Healthy</span>
        {formattedTime && <span className="text-xs text-green-600">({formattedTime})</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 rounded-full border border-red-200">
      <AlertCircle size={14} className="text-red-600" />
      <span className="text-xs font-medium text-red-700">API Offline</span>
      {apiConnectivity.error && (
        <span className="text-xs text-red-600 ml-1">({apiConnectivity.error})</span>
      )}
    </div>
  );
};

export default ApiHealthBadge;
