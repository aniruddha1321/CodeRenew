import React, { useState, useEffect } from 'react';
import { 
  Home, 
  Code, 
  Shield, 
  FileText, 
  Settings,
  FolderGit,
  ChevronRight,
  Wifi,
  WifiOff,
  AlertCircle
} from 'lucide-react';
import { useNavigate } from "react-router-dom";
import { useAppContext } from '@/context/AppContext'; 

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeView, onViewChange }) => {
  const navigate = useNavigate();
  const { apiConnectivity, checkApiConnectivity, selectedModel, availableModels } = useAppContext();

  // Get current model display name
  const getCurrentModelName = () => {
    const model = availableModels.find(m => m.id === selectedModel);
    return model ? model.name : 'Llama 3.3 70B';
  };

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'workspace', label: 'Code Workspace', icon: Code },
    { id: 'security', label: 'Security Scan', icon: Shield },
    { id: 'report', label: 'Summary Report', icon: FileText },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const getStatusIcon = () => {
    if (apiConnectivity.isChecking) {
      return <AlertCircle size={12} className="text-yellow-400 animate-pulse" />;
    }
    if (!apiConnectivity.userConfigured) {
      return <WifiOff size={12} className="text-gray-400" />;
    }
    return (apiConnectivity.isConnected && apiConnectivity.groqConfigured) ? 
      <Wifi size={12} className="text-green-400" /> : 
      <WifiOff size={12} className="text-red-400" />;
  };

  const getStatusText = () => {
    if (apiConnectivity.isChecking) {
      return 'Checking...';
    }
    if (!apiConnectivity.userConfigured) {
      return 'Not Configured';
    }
    if (apiConnectivity.isConnected && apiConnectivity.groqConfigured) {
      return 'Connected';
    }
    if (apiConnectivity.isConnected && !apiConnectivity.groqConfigured) {
      return 'API Key Needed';
    }
    return 'Disconnected';
  };

  const getStatusColor = () => {
    if (apiConnectivity.isChecking) {
      return 'text-yellow-400';
    }
    if (!apiConnectivity.userConfigured) {
      return 'text-gray-400';
    }
    if (apiConnectivity.isConnected && apiConnectivity.groqConfigured) {
      return 'text-green-400';
    }
    if (apiConnectivity.isConnected && !apiConnectivity.groqConfigured) {
      return 'text-orange-400';
    }
    return 'text-red-400';
  };

  const formatLastChecked = () => {
    if (!apiConnectivity.lastChecked) return '';
    const now = new Date();
    const diffMs = now.getTime() - apiConnectivity.lastChecked.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    
    if (diffSecs < 60) return `${diffSecs}s ago`;
    if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
    return `${Math.floor(diffSecs / 3600)}h ago`;
  };

  return (
    <div className="w-64 bg-slate-900 text-white h-screen flex flex-col">
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-xl font-bold text-blue-400">Legacy Code Modernizer</h1>
        <p className="text-sm text-slate-400 mt-1">Python 2 → 3 Converter</p>
      </div>
      
      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => {
                onViewChange(item.id);       
                navigate(item.id === 'dashboard' ? '/' : `/${item.id}`);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                isActive 
                  ? 'bg-blue-600 text-white' 
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon size={18} />
              <span className="flex-1">{item.label}</span>
              {isActive && <ChevronRight size={16} />}
            </button>
          );
        })}
      </nav>
      
      <div className="p-4 border-t border-slate-700 text-xs text-slate-400 space-y-2">
        <div className="flex items-center justify-between">
          <span>API Status:</span>
          <div className="flex items-center gap-1">
            {getStatusIcon()}
            <span className={getStatusColor()}>{getStatusText()}</span>
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <span>Model:</span>
          <span className="text-slate-300 font-medium">{getCurrentModelName()}</span>
        </div>
        
        {apiConnectivity.lastChecked && (
          <div className="text-center text-slate-500 text-[10px]">
            Last checked: {formatLastChecked()}
          </div>
        )}
        
        {apiConnectivity.userConfigured && (!apiConnectivity.isConnected || !apiConnectivity.groqConfigured) && (
          <button
            onClick={checkApiConnectivity}
            disabled={apiConnectivity.isChecking}
            className="w-full text-[10px] text-slate-400 hover:text-slate-300 underline disabled:opacity-50"
          >
            {apiConnectivity.isChecking ? 'Checking...' : 'Retry Connection'}
          </button>
        )}
        
        {!apiConnectivity.userConfigured && (
          <div className="text-center text-slate-500 text-[10px]">
            Configure API key in Settings
          </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;