import React, { createContext, useState, useContext, ReactNode, useEffect, useCallback } from 'react';

// Define the shape of a single conversion report
export interface Report {
  id: number;
  timestamp: Date;
  success: boolean;
  executionTime: number; // in milliseconds
  originalCode: string;
  convertedCode: string;
  explanation: string;
  securityIssues: SecurityIssue[];
  filesCount?: number; // Track actual number of files converted (for consolidated reports)
}

// Define the shape of a security issue
export interface SecurityIssue {
  id: string;
  file: string;
  line: number;
  severity: 'high' | 'medium' | 'low';
  standard: 'HIPAA' | 'ISO27001' | 'General';
  title: string;
  description: string;
  recommendation: string;
  code: string;
  recommended_code: string;
}

// Define the API connectivity state
export interface ApiConnectivity {
  isConnected: boolean;
  isChecking: boolean;
  lastChecked: Date | null;
  error: string | null;
  groqConfigured: boolean;
  userConfigured: boolean; // Track if user has explicitly configured the API through Settings
}

export interface GitConnectivity {
  isConnected: boolean;
  isChecking: boolean;
  lastChecked: Date | null;
  error: string | null;
  githubConfigured: boolean;
  userConfigured: boolean; // Track if user has explicitly configured the API through Settings
}

// Define the workspace state
export interface WorkspaceState {
  uploadedFiles: Record<string, string>;
  convertedFiles: Record<string, string>;
  selectedFileName: string;
  githubFiles: Record<string, string> | null;
  githubDefaultFile: string;
  isConverting: boolean;
  showSummary: boolean;
  fileExplanations?: Record<string, string>; // Store file-specific explanations
  conversionMode: 'py2to3' | 'java2py' | 'py2java' | 'cpp2py' | 'js2py' | 'ts2py' | 'cs2py' | 'rb2py';
}

// Define available AI models
export interface AIModel {
  id: string;
  name: string;
  description: string;
}

// Define the shape of the context state
interface AppContextType {
  reports: Report[];
  addReport: (report: Omit<Report, 'id' | 'timestamp'>) => void;
  latestReport: Report | null;

  // API connectivity management
  apiConnectivity: ApiConnectivity;
  checkApiConnectivity: () => Promise<void>;
  saveApiKey: (apiKey: string) => Promise<boolean>;
  deleteApiKey: (provider: string) => Promise<boolean>;

  gitHubConnectivity: GitConnectivity;
  checkGitHubConnectivity: () => Promise<void>;
  saveGitHubToken: (token: string) => Promise<boolean>;
  deleteGitHubToken: (provider: string) => Promise<boolean>;

  // Workspace state management
  workspaceState: WorkspaceState;
  updateWorkspaceState: (updates: Partial<WorkspaceState>) => void;
  clearWorkspaceState: () => void;

  // AI model selection
  selectedModel: string;
  availableModels: AIModel[];
  updateSelectedModel: (modelId: string) => void;
}

// Create the context
const AppContext = createContext<AppContextType | undefined>(undefined);

// Initial API connectivity state
const initialApiConnectivity: ApiConnectivity = {
  isConnected: false,
  isChecking: false,
  lastChecked: null,
  error: null,
  groqConfigured: false,
  userConfigured: false,
};

// Initial GitHubConnectivity
const initialGitHubConnectivity: GitConnectivity = {
  isConnected: false,
  isChecking: false,
  lastChecked: null,
  error: null,
  githubConfigured: false,
  userConfigured: false,
};

// Initial workspace state
const initialWorkspaceState: WorkspaceState = {
  uploadedFiles: {},
  convertedFiles: {},
  selectedFileName: '',
  githubFiles: null,
  githubDefaultFile: '',
  isConverting: false,
  showSummary: false,
  fileExplanations: {},
  conversionMode: 'py2to3',
};

// Available AI models
const availableModels: AIModel[] = [
  {
    id: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B',
    description: 'Most capable Groq model with excellent reasoning'
  },
  {
    id: 'llama-3.1-8b-instant',
    name: 'Llama 3.1 8B',
    description: 'Fast and efficient for quick code tasks'
  },
  {
    id: 'mixtral-8x7b-32768',
    name: 'Mixtral 8x7B',
    description: 'Great balance of speed and accuracy'
  },
  {
    id: 'gemma2-9b-it',
    name: 'Gemma 2 9B',
    description: 'Compact model with good code understanding'
  }
];

// Create the provider component
export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [reports, setReports] = useState<Report[]>(() => {
    try {
      const saved = localStorage.getItem('coderenew_reports');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Rehydrate Date objects from ISO strings
        return parsed.map((r: any) => ({ ...r, timestamp: new Date(r.timestamp) }));
      }
    } catch {}
    return [];
  });
  const [apiConnectivity, setApiConnectivity] = useState<ApiConnectivity>(() => {
    // Load userConfigured state from localStorage on initialization
    try {
      const savedUserConfigured = localStorage.getItem('legacyCodeModernizer_groqConfigured');
      return {
        ...initialApiConnectivity,
        userConfigured: savedUserConfigured === 'true'
      };
    } catch (error) {
      return initialApiConnectivity;
    }
  });

  const [gitHubConnectivity, setgitHubConnectivity] = useState<GitConnectivity>(() => {
    // Load userConfigured state from localStorage on initialization
    try {
      const savedUserConfigured = localStorage.getItem('legacyCodeModernizer_githubConfigured');
      return {
        ...initialGitHubConnectivity,
        userConfigured: savedUserConfigured === 'true'
      };
    } catch (error) {
      return initialGitHubConnectivity;
    }
  });
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>(() => {
    try {
      const saved = localStorage.getItem('coderenew_workspaceState');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Always reset transient flags on reload
        return { ...initialWorkspaceState, ...parsed, isConverting: false, showSummary: false };
      }
    } catch {}
    return initialWorkspaceState;
  });
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    // Load selected model from localStorage on initialization
    try {
      const savedSettings = localStorage.getItem('legacyCodeModernizer_settings');
      if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        const modelId = settings.aiModel === 'Llama 3.3 70B' ? 'llama-3.3-70b-versatile' :
          settings.aiModel === 'Llama 3.1 8B' ? 'llama-3.1-8b-instant' :
            settings.aiModel === 'Mixtral 8x7B' ? 'mixtral-8x7b-32768' :
              settings.aiModel === 'Gemma 2 9B' ? 'gemma2-9b-it' :
                'llama-3.3-70b-versatile';

        // Migration: If user had no explicit model selection, default to Llama 3.3 70B
        if (!settings.aiModel) {
          settings.aiModel = 'Llama 3.3 70B';
          localStorage.setItem('legacyCodeModernizer_settings', JSON.stringify(settings));
          return 'llama-3.3-70b-versatile';
        }

        return modelId;
      } else {
        // No saved settings at all, initialize with Llama 3.3 70B
        const defaultSettings = { aiModel: 'Llama 3.3 70B' };
        localStorage.setItem('legacyCodeModernizer_settings', JSON.stringify(defaultSettings));
        return 'llama-3.3-70b-versatile';
      }
    } catch (error) {
      console.error('Error loading model from settings:', error);
      // On error, also initialize with Llama 3.3 70B
      const defaultSettings = { aiModel: 'Llama 3.3 70B' };
      localStorage.setItem('legacyCodeModernizer_settings', JSON.stringify(defaultSettings));
    }
    return 'llama-3.3-70b-versatile'; // Default to latest model
  });

  const addReport = (reportData: Omit<Report, 'id' | 'timestamp'>) => {
    const newReport: Report = {
      ...reportData,
      id: Date.now(),
      timestamp: new Date(),
    };
    setReports(prevReports => [newReport, ...prevReports]);
  };

  const checkApiConnectivity = useCallback(async (): Promise<void> => {
    setApiConnectivity(prev => ({ ...prev, isChecking: true, error: null }));

    try {
      const response = await fetch('http://127.0.0.1:5000/api/health');
      const data = await response.json();

      if (response.ok) {

        setApiConnectivity(prev => ({
          ...prev,
          isConnected: true,
          isChecking: false,
          lastChecked: new Date(),
          error: null,
          groqConfigured: data.openai_configured || false,
          // Keep userConfigured as is, don't modify it based on backend state
          userConfigured: prev.userConfigured,
        }));
      } else {
        throw new Error(data.error || 'Health check failed');
      }
    } catch (error) {
      setApiConnectivity(prev => ({
        ...prev,
        isConnected: false,
        isChecking: false,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Connection failed',
        groqConfigured: false,
        userConfigured: false,
      }));
    }
  }, []); // No dependencies needed since we're only using setState


  const checkGitHubConnectivity = useCallback(async (): Promise<void> => {
    setgitHubConnectivity(prev => ({ ...prev, isChecking: true, error: null }));

    try {
      const response = await fetch('http://127.0.0.1:5000/api/github/health');
      const data = await response.json();

      if (response.ok) {
        setgitHubConnectivity(prev => ({
          ...prev,
          isConnected: data.connected || false,
          isChecking: false,
          lastChecked: new Date(),
          error: data.error || null,
          githubConfigured: data.github_configured || false,
          // Keep userConfigured as is, don't modify it based on backend state
          userConfigured: prev.userConfigured,
        }));
      } else {
        throw new Error(data.error || 'GitHub health check failed');
      }
    } catch (error) {
      setgitHubConnectivity(prev => ({
        ...prev,
        isConnected: false,
        isChecking: false,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Connection failed',
        githubConfigured: false,
        userConfigured: false,
      }));
    }
  }, []); // No dependencies needed since we're only using setState

  const saveApiKey = useCallback(async (apiKey: string): Promise<boolean> => {
    try {
      const response = await fetch('http://127.0.0.1:5000/api/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: 'groq',
          api: apiKey,
        }),
      });

      const data = await response.json();

      if (response.ok && data.status === 'success') {
        // Mark as user configured and save to localStorage
        localStorage.setItem('legacyCodeModernizer_groqConfigured', 'true');

        // Update state with userConfigured flag and then check connectivity
        setApiConnectivity(prev => ({
          ...prev,
          userConfigured: true,
          isConnected: true, // Assume connected since API save succeeded
          groqConfigured: true // Assume configured since we just saved a key
        }));

        // Still check connectivity to get accurate server state
        await checkApiConnectivity();
        return true;
      } else {
        throw new Error(data.message || 'Failed to save API key');
      }
    } catch (error) {
      setApiConnectivity(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to save API key',
      }));
      return false;
    }
  }, [checkApiConnectivity]);

  const saveGitHubToken = useCallback(async (token: string): Promise<boolean> => {
    try {
      const response = await fetch('http://127.0.0.1:5000/api/gitsave', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: 'GitHub',
          token: token,
        }),
      });

      const data = await response.json();

      if (response.ok && data.status === 'success') {
        // Mark as user configured and save to localStorage
        localStorage.setItem('legacyCodeModernizer_githubConfigured', 'true');

        // Update state with userConfigured flag and then check connectivity
        setgitHubConnectivity(prev => ({
          ...prev,
          userConfigured: true,
          isConnected: true, // Assume connected since API save succeeded
          githubConfigured: true // Assume configured since we just saved a key
        }));

        // Still check connectivity to get accurate server state
        await checkGitHubConnectivity();
        return true;
      } else {
        throw new Error(data.message || 'Failed to save GitHub Token');
      }
    } catch (error) {
      setgitHubConnectivity(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to save GitHub Token',
      }));
      return false;
    }
  }, [checkGitHubConnectivity]);

  const deleteApiKey = useCallback(async (provider: string): Promise<boolean> => {
    try {
      const response = await fetch('http://127.0.0.1:5000/api/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: provider,
        }),
      });

      const data = await response.json();

      if (response.ok && data.status === 'success') {
        // After deleting API key, update connectivity state and clear localStorage
        localStorage.setItem('legacyCodeModernizer_groqConfigured', 'false');
        setApiConnectivity(prev => ({
          ...prev,
          isConnected: false,
          groqConfigured: false,
          userConfigured: false,
          error: null,
        }));
        return true;
      } else {
        throw new Error(data.message || 'Failed to delete API key');
      }
    } catch (error) {
      setApiConnectivity(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to delete API key',
      }));
      return false;
    }
  }, []);


  const deleteGitHubToken = useCallback(async (provider: string): Promise<boolean> => {
    try {
      const response = await fetch('http://127.0.0.1:5000/api/gitdelete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: provider,
        }),
      });

      const data = await response.json();

      if (response.ok && data.status === 'success') {
        // After deleting GitHub token, update connectivity state and clear localStorage
        localStorage.setItem('legacyCodeModernizer_githubConfigured', 'false');
        setgitHubConnectivity(prev => ({
          ...prev,
          isConnected: false,
          githubConfigured: false,
          userConfigured: false,
          error: null,
        }));
        return true;
      } else {
        throw new Error(data.message || 'Failed to delete GitHub Token');
      }
    } catch (error) {
      setgitHubConnectivity(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to delete GitHub Token',
      }));
      return false;
    }
  }, []);

  const updateWorkspaceState = (updates: Partial<WorkspaceState>) => {
    setWorkspaceState(prev => ({ ...prev, ...updates }));
  };

  const clearWorkspaceState = () => {
    setWorkspaceState(initialWorkspaceState);
    localStorage.removeItem('coderenew_workspaceState');
  };

  const updateSelectedModel = (modelId: string) => {
    setSelectedModel(modelId);
    // Also update localStorage settings to keep them in sync
    try {
      const savedSettings = localStorage.getItem('legacyCodeModernizer_settings');
      let settings = savedSettings ? JSON.parse(savedSettings) : {};

      // Convert modelId back to display format for localStorage
      const displayModel = modelId === 'llama-3.3-70b-versatile' ? 'Llama 3.3 70B' :
        modelId === 'llama-3.1-8b-instant' ? 'Llama 3.1 8B' :
          modelId === 'mixtral-8x7b-32768' ? 'Mixtral 8x7B' :
            modelId === 'gemma2-9b-it' ? 'Gemma 2 9B' :
              'Llama 3.3 70B';

      settings.aiModel = displayModel;
      localStorage.setItem('legacyCodeModernizer_settings', JSON.stringify(settings));

      // Dispatch event to notify other components
      window.dispatchEvent(new CustomEvent('settingsUpdated', { detail: settings }));
    } catch (error) {
      console.error('Error updating model in settings:', error);
    }
  };

  const latestReport = reports.length > 0 ? reports[0] : null;

  // Persist reports to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('coderenew_reports', JSON.stringify(reports));
    } catch (e) {
      console.warn('Could not persist reports to localStorage:', e);
    }
  }, [reports]);

  // Persist workspaceState (excluding transient flags) whenever it changes
  useEffect(() => {
    try {
      const { isConverting, showSummary, ...persistable } = workspaceState;
      localStorage.setItem('coderenew_workspaceState', JSON.stringify(persistable));
    } catch (e) {
      console.warn('Could not persist workspaceState to localStorage:', e);
    }
  }, [workspaceState]);

  // Check API connectivity on app startup if user has configured it
  useEffect(() => {
    const initializeApiStatus = async () => {
      // Get the initial userConfigured state from localStorage
      const savedUserConfigured = localStorage.getItem('legacyCodeModernizer_groqConfigured');
      if (savedUserConfigured === 'true') {
        await checkApiConnectivity();
      }
    };

    initializeApiStatus();
  }, [checkApiConnectivity]); // Only run once on mount

  useEffect(() => {
    const initializeGitStatus = async () => {
      // Get the initial userConfigured state from localStorage
      const savedUserConfigured = localStorage.getItem('legacyCodeModernizer_githubConfigured');
      if (savedUserConfigured === 'true') {
        await checkGitHubConnectivity();
      }
    };

    initializeGitStatus();
  }, [checkGitHubConnectivity]); // Only run once on mount

  // Listen for settings changes to update selected model
  useEffect(() => {
    const handleSettingsUpdate = (event: CustomEvent) => {
      const settings = event.detail;
      if (settings.aiModel) {
        const modelId = settings.aiModel === 'Llama 3.3 70B' ? 'llama-3.3-70b-versatile' :
          settings.aiModel === 'Llama 3.1 8B' ? 'llama-3.1-8b-instant' :
            settings.aiModel === 'Mixtral 8x7B' ? 'mixtral-8x7b-32768' :
              settings.aiModel === 'Gemma 2 9B' ? 'gemma2-9b-it' :
                'llama-3.3-70b-versatile';
        setSelectedModel(modelId);
      }
    };

    window.addEventListener('settingsUpdated', handleSettingsUpdate as EventListener);

    return () => {
      window.removeEventListener('settingsUpdated', handleSettingsUpdate as EventListener);
    };
  }, []);

  return (
    <AppContext.Provider value={{
      reports,
      addReport,
      latestReport,
      apiConnectivity,
      checkApiConnectivity,
      saveApiKey,
      deleteApiKey,
      gitHubConnectivity,
      checkGitHubConnectivity,
      saveGitHubToken,
      deleteGitHubToken,
      workspaceState,
      updateWorkspaceState,
      clearWorkspaceState,
      selectedModel,
      availableModels,
      updateSelectedModel
    }}>
      {children}
    </AppContext.Provider>
  );
};

// Create a custom hook for easy context access
export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};