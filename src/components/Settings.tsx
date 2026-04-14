import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, Key, Globe, Shield, CheckCircle, Eye, EyeOff, Wifi, WifiOff, Loader2, AlertCircle, Trash2 } from 'lucide-react';
import { toast } from "@/components/ui/sonner";
import { useAppContext } from '@/context/AppContext';

interface SettingsState {
  aiModel: string;
  groqApiKey: string;
  githubToken: string;
  language: string;
  secureMode: boolean;
  autoScan: boolean;
  complianceStandards: string[];
}

const Settings: React.FC = () => {
  const { apiConnectivity, checkApiConnectivity, saveApiKey, deleteApiKey,gitHubConnectivity, checkGitHubConnectivity, saveGitHubToken, deleteGitHubToken, selectedModel, availableModels, updateSelectedModel } = useAppContext();
  const [settings, setSettings] = useState<SettingsState>({
    aiModel: 'Llama 3.3 70B',
    groqApiKey: '',
    githubToken: '',
    language: 'en',
    secureMode: true,
    autoScan: true,
    complianceStandards: ['hipaa', 'iso27001']
  });

  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showGitToken, setShowGitToken] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isGitConnecting, setIsGitConnecting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isGitClearing, setIsGitClearing] = useState(false);
  
  // Track whether we're showing masked values vs actual input
  const [hasExistingApiKey, setHasExistingApiKey] = useState(false);
  const [hasExistingToken, setHasExistingToken] = useState(false);
  const [actualApiKey, setActualApiKey] = useState('');
  const [actualToken, setActualToken] = useState('');

  // Load settings from localStorage on component mount
  useEffect(() => {
    loadSettings();
  }, []);

  // Clean up any masked/corrupted API keys that might be stored
  // This is now called from loadExistingApiKey to avoid duplicate API calls
  const cleanupCorruptedKeys = async () => {
    try {
      // Only cleanup if there's an encoding error detected
      if (apiConnectivity.error && apiConnectivity.error.includes('ascii')) {
        // This suggests the stored key has encoding issues, clear it
        await deleteApiKey('groq');
        console.log('Cleaned up corrupted Groq API key');
      }
    } catch (error) {
      console.log('Error during cleanup, continuing normally:', error);
    }
  };

  const cleanupCorruptedGitHubToken = async () => {
    try {
      if (gitHubConnectivity.error && gitHubConnectivity.error.includes('ascii')) {
        // This suggests the stored token has encoding issues, clear it
        await deleteGitHubToken('GitHub');
        console.log('Cleaned up corrupted GitHub token');
      }
    } catch (error) {
      console.log('Error during GitHub cleanup, continuing normally:', error);
    }
  };

  // Load existing API key when user configuration or connection status changes
  useEffect(() => {
    loadExistingApiKey();
  }, [apiConnectivity.userConfigured, apiConnectivity.isConnected, apiConnectivity.groqConfigured]);

  useEffect(() => {
    loadExistingToken();
  }, [gitHubConnectivity.userConfigured, gitHubConnectivity.isConnected, gitHubConnectivity.githubConfigured]);

  const loadExistingApiKey = async () => {
    try {
      // Only check if user has previously configured the API
      if (apiConnectivity.userConfigured) {
        // The context should already have checked connectivity on app startup
        // We only need to check again if there's no lastChecked timestamp at all
        // and we're not currently checking (to avoid race conditions)
        if (!apiConnectivity.lastChecked && !apiConnectivity.isChecking) {
          await checkApiConnectivity();
        }
        
        // Clean up corrupted keys if needed
        await cleanupCorruptedKeys();
        
        if (apiConnectivity.isConnected && apiConnectivity.groqConfigured) {
          // We know there's a key, but we don't show it for security reasons
          // Just indicate that there's an existing key
          setHasExistingApiKey(true);
          setSettings(prev => ({ 
            ...prev, 
            groqApiKey: '••••••••••••••••••••••••••••••••••••••••••••••••••••' // Masked key
          }));
        } else {
          setHasExistingApiKey(false);
        }
      } else {
        setHasExistingApiKey(false);
      }
    } catch (error) {
      console.error('Error checking existing API key:', error);
      setHasExistingApiKey(false);
    }
  };

  const loadExistingToken = async () => {
    try {
      // Only check if user has previously configured the API
      if (gitHubConnectivity.userConfigured) {
        // The context should already have checked connectivity on app startup
        // We only need to check again if there's no lastChecked timestamp at all
        // and we're not currently checking (to avoid race conditions)
        if (!gitHubConnectivity.lastChecked && !gitHubConnectivity.isChecking) {
          await checkGitHubConnectivity();
        }
        
        // Clean up corrupted tokens if needed
        await cleanupCorruptedGitHubToken();
        
        if (gitHubConnectivity.isConnected && gitHubConnectivity.githubConfigured) {
          // We know there's a token, but we don't show it for security reasons
          // Just indicate that there's an existing token
          setHasExistingToken(true);
          setSettings(prev => ({ 
            ...prev, 
            githubToken: '••••••••••••••••••••••••••••••••••••••••••••••••••••' // Masked token
          }));
        } else {
          setHasExistingToken(false);
        }
      } else {
        setHasExistingToken(false);
      }
    } catch (error) {
      console.error('Error checking existing token:', error);
      setHasExistingToken(false);
    }
  };

  const loadSettings = () => {
    try {
      const savedSettings = localStorage.getItem('legacyCodeModernizer_settings');
      if (savedSettings) {
        const parsedSettings = JSON.parse(savedSettings);
        const mergedSettings: SettingsState = {
        aiModel: parsedSettings.aiModel || 'Llama 3.3 70B',
        // Clean up any masked values that might have been saved previously
        groqApiKey: (parsedSettings.groqApiKey && parsedSettings.groqApiKey.includes('••••')) ? '' : (parsedSettings.groqApiKey || ''),
        githubToken: (parsedSettings.githubToken && parsedSettings.githubToken.includes('••••')) ? '' : (parsedSettings.githubToken || ''),
        language: parsedSettings.language || 'en',
        secureMode: parsedSettings.secureMode ?? true,
        autoScan: parsedSettings.autoScan ?? true,
        complianceStandards: parsedSettings.complianceStandards || ['hipaa', 'iso27001']
      };
        setSettings(mergedSettings);
        setLastSaved(new Date(parsedSettings.lastSaved || Date.now()));
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      toast("Error loading settings", { 
        description: "Using default settings instead." 
      });
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    
    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Don't save masked API keys/tokens to localStorage
      const settingsToSave = {
        ...settings,
        lastSaved: new Date().toISOString(),
        // Remove masked values - they shouldn't be persisted
        groqApiKey: hasExistingApiKey ? '' : settings.groqApiKey,
        githubToken: hasExistingToken ? '' : settings.githubToken
      };
      
      // Save to localStorage
      localStorage.setItem('legacyCodeModernizer_settings', JSON.stringify(settingsToSave));
      
      // Dispatch custom event to notify other components
      window.dispatchEvent(new CustomEvent('settingsUpdated', { 
        detail: settingsToSave 
      }));
      
      setLastSaved(new Date());
      
      toast("Settings saved successfully!", {
        description: "Your preferences have been updated.",
        icon: <CheckCircle className="text-green-500" size={16} />
      });
      
    } catch (error) {
      console.error('Error saving settings:', error);
      toast("Failed to save settings", { 
        description: "Please try again." 
      });
    } finally {
      setIsSaving(false);
    }
  };

  

  const handleModelChange = (newModel: string) => {
    setSettings(prev => ({ ...prev, aiModel: newModel }));
    // Convert display model to API model ID and update context
    const modelId = newModel === 'Llama 3.3 70B' ? 'llama-3.3-70b-versatile' :
                   newModel === 'Llama 3.1 8B' ? 'llama-3.1-8b-instant' :
                   newModel === 'Mixtral 8x7B' ? 'mixtral-8x7b-32768' :
                   newModel === 'Gemma 2 9B' ? 'gemma2-9b-it' :
                   'llama-3.3-70b-versatile';
    updateSelectedModel(modelId);
  };

  const handleApiKeyChange = (newApiKey: string) => {
    // If user starts typing, clear the masked value and use actual input
    if (hasExistingApiKey && newApiKey !== settings.groqApiKey) {
      setHasExistingApiKey(false);
    }
    setActualApiKey(newApiKey);
    setSettings(prev => ({ ...prev, groqApiKey: newApiKey }));
  };

  const handleTokenChange = (newToken: string) => {
    // If user starts typing, clear the masked value and use actual input
    if (hasExistingToken && newToken !== settings.githubToken) {
      setHasExistingToken(false);
    }
    setActualToken(newToken);
    setSettings(prev => ({ ...prev, githubToken: newToken }));
  };

  const handleConnectApi = async () => {
    // If we have an existing key, just test the connection
    if (hasExistingApiKey) {
      await checkApiConnectivity();
      if (apiConnectivity.isConnected && apiConnectivity.groqConfigured) {
        toast("API connection confirmed!", {
          description: "Successfully connected to Groq API using existing key.",
          icon: <CheckCircle className="text-green-500" size={16} />
        });
      } else {
        toast("Connection test failed", {
          description: apiConnectivity.error || "Unable to connect with existing API key.",
          icon: <AlertCircle className="text-red-500" size={16} />
        });
      }
      return;
    }

    // For new API key input
    const keyToUse = actualApiKey.trim() || settings.groqApiKey.trim();
    if (!keyToUse) {
      toast("Please enter an API key", {
        description: "A Groq API key is required to establish connection.",
        icon: <AlertCircle className="text-red-500" size={16} />
      });
      return;
    }

    setIsConnecting(true);
    
    try {
      const success = await saveApiKey(keyToUse);
      
      if (success) {
        toast("API connection established!", {
          description: "Successfully connected to Groq API.",
          icon: <CheckCircle className="text-green-500" size={16} />
        });
        // Reset state for future connections
        setHasExistingApiKey(true);
        setActualApiKey('');
        setSettings(prev => ({ 
          ...prev, 
          groqApiKey: '••••••••••••••••••••••••••••••••••••••••••••••••••••'
        }));
      } else {
        toast("Failed to establish API connection", {
          description: apiConnectivity.error || "Please check your API key and try again.",
          icon: <AlertCircle className="text-red-500" size={16} />
        });
      }
    } catch (error) {
      toast("Connection error", {
        description: "An unexpected error occurred while connecting.",
        icon: <AlertCircle className="text-red-500" size={16} />
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleConnectToken = async () => {
    // If we have an existing token, just test the connection
    if (hasExistingToken) {
      await checkGitHubConnectivity();
      if (gitHubConnectivity.isConnected && gitHubConnectivity.githubConfigured) {
        toast("GitHub connection confirmed!", {
          description: "Successfully connected to GitHub using existing token.",
          icon: <CheckCircle className="text-green-500" size={16} />
        });
      } else {
        toast("Connection test failed", {
          description: gitHubConnectivity.error || "Unable to connect with existing token.",
          icon: <AlertCircle className="text-red-500" size={16} />
        });
      }
      return;
    }

    // For new token input
    const tokenToUse = actualToken.trim() || settings.githubToken.trim();
    if (!tokenToUse) {
      toast("Please enter a personal access token", {
        description: "A personal access token is required to establish a connection to GitHub.",
        icon: <AlertCircle className="text-red-500" size={16} />
      });
      return;
    }

    setIsGitConnecting(true);
    
    try {
      const success = await saveGitHubToken(tokenToUse);
      
      if (success) {
        toast("GitHub connection established!", {
          description: "Successfully connected to GitHub.",
          icon: <CheckCircle className="text-green-500" size={16} />
        });
        // Reset state for future connections
        setHasExistingToken(true);
        setActualToken('');
        setSettings(prev => ({ 
          ...prev, 
          githubToken: '••••••••••••••••••••••••••••••••••••••••••••••••••••'
        }));
      } else {
        toast("Failed to establish GitHub connection", {
          description: gitHubConnectivity.error || "Please check your personal access token and try again.",
          icon: <AlertCircle className="text-red-500" size={16} />
        });
      }
    } catch (error) {
      toast("Connection error", {
        description: "An unexpected error occurred while connecting.",
        icon: <AlertCircle className="text-red-500" size={16} />
      });
    } finally {
      setIsGitConnecting(false);
    }
  };


  const handleClearApiKey = async () => {
    setIsClearing(true);
    
    try {
      const success = await deleteApiKey('groq');
      
      if (success) {
        setSettings(prev => ({ ...prev, groqApiKey: '' }));
        setHasExistingApiKey(false);
        setActualApiKey('');
        toast("API key cleared successfully!", {
          description: "Your Groq API key has been removed from storage.",
          icon: <CheckCircle className="text-green-500" size={16} />
        });
      } else {
        toast("Failed to clear API key", {
          description: "Please try again.",
          icon: <AlertCircle className="text-red-500" size={16} />
        });
      }
    } catch (error) {
      toast("Error clearing API key", {
        description: "An unexpected error occurred.",
        icon: <AlertCircle className="text-red-500" size={16} />
      });
    } finally {
      setIsClearing(false);
    }
  };


  const handleClearToken = async () => {
    setIsGitClearing(true);
    
    try {
      const success = await deleteGitHubToken('GitHub');
      
      if (success) {
        setSettings(prev => ({ ...prev, githubToken: '' }));
        setHasExistingToken(false);
        setActualToken('');
        toast("Personal access token cleared successfully!", {
          description: "Your GitHub personal access token has been removed from storage.",
          icon: <CheckCircle className="text-green-500" size={16} />
        });
      } else {
        toast("Failed to clear token", {
          description: "Please try again.",
          icon: <AlertCircle className="text-red-500" size={16} />
        });
      }
    } catch (error) {
      toast("Error clearing token", {
        description: "An unexpected error occurred.",
        icon: <AlertCircle className="text-red-500" size={16} />
      });
    } finally {
      setIsGitClearing(false);
    }
  };

  const handleLanguageChange = (newLanguage: string) => {
    setSettings(prev => ({ ...prev, language: newLanguage }));
  };

  const handleSecureModeChange = (enabled: boolean) => {
    setSettings(prev => ({ ...prev, secureMode: enabled }));
  };

  const handleAutoScanChange = (enabled: boolean) => {
    setSettings(prev => ({ ...prev, autoScan: enabled }));
  };

  const handleComplianceStandardChange = (standard: string, enabled: boolean) => {
    setSettings(prev => ({
      ...prev,
      complianceStandards: enabled
        ? [...prev.complianceStandards, standard]
        : prev.complianceStandards.filter(s => s !== standard)
    }));
  };

  const formatLastSaved = () => {
    if (!lastSaved) return 'Never';
    
    const now = new Date();
    const diffMs = now.getTime() - lastSaved.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    
    if (diffSecs < 60) return `${diffSecs} seconds ago`;
    if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)} minutes ago`;
    if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)} hours ago`;
    return lastSaved.toLocaleDateString();
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <SettingsIcon className="text-blue-600" size={28} />
            <div>
              <h2 className="text-3xl font-bold text-gray-900">Settings</h2>
              {lastSaved && (
                <p className="text-sm text-gray-500 mt-1">
                  Last saved: {formatLastSaved()}
                </p>
              )}
            </div>
          </div>
          
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={16} />
            {isSaving ? "Saving..." : "Save Settings"}
          </button>
        </div>

        <div className="space-y-6">
          {/* AI Model Settings */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Key className="text-blue-500" size={20} />
                AI Model Configuration
              </h3>
              <div className="flex items-center gap-2">
                {apiConnectivity.isConnected ? (
                  <div className="flex items-center gap-1 text-green-600 text-sm">
                    <Wifi size={16} />
                    <span>Connected</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-red-600 text-sm">
                    <WifiOff size={16} />
                    <span>Disconnected</span>
                  </div>
                )}
                {apiConnectivity.lastChecked && (
                  <span className="text-xs text-gray-500">
                    Last checked: {apiConnectivity.lastChecked.toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Groq API Key
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={settings.groqApiKey}
                    onChange={(e) => handleApiKeyChange(e.target.value)}
                    placeholder="Enter your Groq API key"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                  >
                    {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  <em>Used to authenticate and run code conversion through Groq. Your key is stored securely.</em>
                  {hasExistingApiKey && (
                    <span className="block text-blue-600 font-medium mt-1">
                      ✓ API key is configured. Clear the field to enter a new key.
                    </span>
                  )}
                </p>
                
                {/* Connection controls */}
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={handleConnectApi}
                    disabled={isConnecting || (!hasExistingApiKey && !settings.groqApiKey.trim())}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {isConnecting ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <Wifi size={14} />
                        {hasExistingApiKey ? 'Test API Connection' : 'Connect API'}
                      </>
                    )}
                  </button>
                  
                  {(apiConnectivity.isConnected && apiConnectivity.groqConfigured) && (
                    <button
                      onClick={handleClearApiKey}
                      disabled={isClearing}
                      className="border border-red-300 text-red-700 px-4 py-2 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      {isClearing ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Clearing...
                        </>
                      ) : (
                        <>
                          <Trash2 size={14} />
                          Clear API Key
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Connection status and error display */}
                {apiConnectivity.error && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center gap-2 text-red-700 text-sm">
                      <AlertCircle size={16} />
                      <span className="font-medium">Connection Error</span>
                    </div>
                    <p className="text-red-600 text-sm mt-1">{apiConnectivity.error}</p>
                  </div>
                )}

                {apiConnectivity.isConnected && apiConnectivity.groqConfigured && (
                  <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-2 text-green-700 text-sm">
                      <CheckCircle size={16} />
                      <span className="font-medium">API Connected</span>
                    </div>
                    <p className="text-green-600 text-sm mt-1">Groq API is configured and ready to use.</p>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  AI Model
                </label>
                <select 
                  value={settings.aiModel}
                  onChange={(e) => handleModelChange(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {availableModels.map((model) => (
                    <option key={model.id} value={model.name}>
                      {model.name} {model.name === 'Llama 3.3 70B' ? '(Flagship)' : model.name === 'Llama 3.1 8B' ? '(Fast)' : model.name === 'Mixtral 8x7B' ? '(Balanced)' : '(Compact)'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-sm text-gray-600 bg-blue-50 p-3 rounded-lg space-y-1">
                {availableModels.map((model) => (
                  <div key={model.id}>
                    <strong>{model.name}</strong>: {model.description.toLowerCase()}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Key className="text-blue-500" size={20} />
                GitHub Configuration
              </h3>
              <div className="flex items-center gap-2">
                {gitHubConnectivity.isConnected ? (
                  <div className="flex items-center gap-1 text-green-600 text-sm">
                    <Wifi size={16} />
                    <span>Connected</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-red-600 text-sm">
                    <WifiOff size={16} />
                    <span>Disconnected</span>
                  </div>
                )}
                {gitHubConnectivity.lastChecked && (
                  <span className="text-xs text-gray-500">
                    Last checked: {gitHubConnectivity.lastChecked.toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Personal Token
                </label>
                <div className="relative">
                  <input
                    type={showGitToken ? "text" : "password"}
                    value={settings.githubToken}
                    onChange={(e) => handleTokenChange(e.target.value)}
                    placeholder="Enter your GitHub Personal Access Token"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGitToken(!showGitToken)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                  >
                    {showGitToken ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  <em>Used to import and commit code to GitHub repositories using a personal access token. Your token is stored securely.</em>
                  {hasExistingToken && (
                    <span className="block text-blue-600 font-medium mt-1">
                      ✓ GitHub token is configured. Clear the field to enter a new token.
                    </span>
                  )}
                </p>
                
                {/* Connection controls */}
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={handleConnectToken}
                    disabled={isGitConnecting || (!hasExistingToken && !settings.githubToken.trim())}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {isGitConnecting ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <Wifi size={14} />
                        {hasExistingToken ? 'Test GitHub Connection' : 'Connect GitHub'}
                      </>
                    )}
                  </button>
                  
                  {(gitHubConnectivity.isConnected && gitHubConnectivity.githubConfigured) && (
                    <button
                      onClick={handleClearToken}
                      disabled={isGitClearing}
                      className="border border-red-300 text-red-700 px-4 py-2 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      {isGitClearing ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Clearing...
                        </>
                      ) : (
                        <>
                          <Trash2 size={14} />
                          Clear Token
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Connection status and error display */}
                {gitHubConnectivity.error && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center gap-2 text-red-700 text-sm">
                      <AlertCircle size={16} />
                      <span className="font-medium">Connection Error</span>
                    </div>
                    <p className="text-red-600 text-sm mt-1">{gitHubConnectivity.error}</p>
                  </div>
                )}

                {gitHubConnectivity.isConnected && gitHubConnectivity.githubConfigured && (
                  <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-2 text-green-700 text-sm">
                      <CheckCircle size={16} />
                      <span className="font-medium">GitHub Connected</span>
                    </div>
                    <p className="text-green-600 text-sm mt-1">GitHub is configured and ready to use.</p>
                  </div>
                )}
              </div>
              
            </div>
          </div>

          {/* Security Settings */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Shield className="text-orange-500" size={20} />
              Security & Privacy
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-700">Secure Mode</label>
                  <p className="text-sm text-gray-500">Keep all file processing local (no cloud upload)</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={settings.secureMode}
                    onChange={(e) => handleSecureModeChange(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-700">Auto Security Scan</label>
                  <p className="text-sm text-gray-500">Automatically scan converted code for security issues</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={settings.autoScan}
                    onChange={(e) => handleAutoScanChange(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Compliance Standards
                </label>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input 
                      type="checkbox" 
                      checked={settings.complianceStandards.includes('hipaa')}
                      onChange={(e) => handleComplianceStandardChange('hipaa', e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">HIPAA (Healthcare)</span>
                  </label>
                  <label className="flex items-center">
                    <input 
                      type="checkbox" 
                      checked={settings.complianceStandards.includes('iso27001')}
                      onChange={(e) => handleComplianceStandardChange('iso27001', e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">ISO 27001 (Information Security)</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;