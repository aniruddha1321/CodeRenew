import React, { useRef, useState, useEffect } from "react";
import {
  Download,
  Copy,
  RotateCcw,
  FileText,
  FolderOpen,
  FolderInput,
  History,
  X,
  Play,
  Github,
  Folder,
  File,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  Shield,
  AlertCircle,
  FileCode,
} from "lucide-react";
import axios from "axios";
import { saveAs } from "file-saver";
import JSZip from "jszip";
import { toast } from "@/components/ui/sonner";
import { useAppContext, SecurityIssue, WorkspaceState } from '@/context/AppContext';
import { useLocation, useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface GitHubFile {
  name: string;
  path: string;
  type: 'file' | 'dir';
  content?: string;
  children?: GitHubFile[];
  selected?: boolean;
  expanded?: boolean;
}

const CodeWorkspace: React.FC = () => {
  const BACKEND_URL = "http://127.0.0.1:5000";
  const [dragOver, setDragOver] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const passedCode = location.state?.code || "";
  const githubFiles = location.state?.files || null;
  const githubDefaultFile = location.state?.defaultFile || "";

  // Get context
  const { addReport, latestReport, workspaceState, updateWorkspaceState, apiConnectivity, selectedModel, availableModels } = useAppContext();

  // Initialize state from context or defaults
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, string>>(workspaceState.uploadedFiles);
  const [convertedFiles, setConvertedFiles] = useState<Record<string, string>>(workspaceState.convertedFiles);
  const [selectedFileName, setSelectedFileName] = useState<string>(workspaceState.selectedFileName);
  const [isConverting, setIsConverting] = useState(workspaceState.isConverting);
  const [showSummary, setShowSummary] = useState(workspaceState.showSummary);

  // GitHub integration state
  const [githubUrl, setGithubUrl] = useState("");
  const [githubFileTree, setGithubFileTree] = useState<GitHubFile[]>([]);
  const [isLoadingRepo, setIsLoadingRepo] = useState(false);
  const [githubModalOpenPython2, setGithubModalOpenPython2] = useState(false);
  const [githubModalOpenPython3, setGithubModalOpenPython3] = useState(false);
  const [repoLoadFailed, setRepoLoadFailed] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [repos, setRepos] = useState<any[]>([]);
  const [commitMessage, setCommitMessage] = useState("");
  const [targetPath, setTargetPath] = useState(`converted/${selectedFileName.replace(/\.py$/, "_converted.py")}`);
  const [repoInput, setRepoInput] = useState(""); // stores user input like 'username/repo'
  const [githubAuthenticated, setGithubAuthenticated] = useState<boolean | null>(null); // null = not checked yet

  // File sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Folder import state
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderPath, setFolderPath] = useState("");
  const [isLoadingFolder, setIsLoadingFolder] = useState(false);

  // Conversion history state
  const [conversionHistory, setConversionHistory] = useState<Record<string, Array<{
    timestamp: string;
    model: string;
    originalCode: string;
    convertedCode: string;
    explanation: string;
    mode: string;
  }>>>(() => {
    try {
      const saved = localStorage.getItem('codeRenew_conversionHistory');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [showHistoryFor, setShowHistoryFor] = useState<string | null>(null);

  const python2Code = selectedFileName ? uploadedFiles[selectedFileName] || "" : passedCode;
  const python3Code = selectedFileName && convertedFiles[selectedFileName]
    ? convertedFiles[selectedFileName]
    : "Converted code will appear here...";

  // Get file-specific explanation from workspace state
  const codeChanges = selectedFileName && workspaceState.fileExplanations?.[selectedFileName]
    ? workspaceState.fileExplanations[selectedFileName]
    : (latestReport?.explanation ?? "");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const leftPanelRef = useRef<HTMLTextAreaElement | null>(null);
  const rightPanelRef = useRef<HTMLTextAreaElement | null>(null);

  // Get current model display name
  const getCurrentModelName = () => {
    const model = availableModels.find(m => m.id === selectedModel);
    return model ? model.name : 'Llama 3.3 70B';
  };

  // Update context whenever state changes
  useEffect(() => {
    updateWorkspaceState({
      uploadedFiles,
      convertedFiles,
      selectedFileName,
      isConverting,
      showSummary,
    });
  }, [uploadedFiles, convertedFiles, selectedFileName, isConverting, showSummary]);

  // Handle initial state from navigation or persisted state
  useEffect(() => {
    // If coming from navigation with new data
    if (githubFiles && Object.keys(githubFiles).length > 0) {
      setUploadedFiles(githubFiles);
      setSelectedFileName(githubDefaultFile || Object.keys(githubFiles)[0]);
      updateWorkspaceState({
        githubFiles,
        githubDefaultFile,
      });
    }
    // If there's passed code and no existing files
    else if (passedCode && Object.keys(uploadedFiles).length === 0 && !selectedFileName) {
      const initialFileName = "pasted_code.py";
      setUploadedFiles({ [initialFileName]: passedCode });
      setSelectedFileName(initialFileName);
    }
    // If returning to the workspace with existing state
    else if (workspaceState.uploadedFiles && Object.keys(workspaceState.uploadedFiles).length > 0) {
      setUploadedFiles(workspaceState.uploadedFiles);
      setConvertedFiles(workspaceState.convertedFiles);
      setSelectedFileName(workspaceState.selectedFileName);
      setIsConverting(workspaceState.isConverting);
      setShowSummary(workspaceState.showSummary);

      // Show summary if there's already converted content and explanation
      if (Object.keys(workspaceState.convertedFiles).length > 0 && latestReport?.explanation) {
        setShowSummary(true);
      }
    }
  }, []);

  // Listen for changes in workspace state from context to keep in sync
  useEffect(() => {
    if (workspaceState.isConverting !== isConverting) {
      setIsConverting(workspaceState.isConverting);
    }
    if (workspaceState.showSummary !== showSummary) {
      setShowSummary(workspaceState.showSummary);
    }
    // Ensure converted files are synced when workspace state changes
    if (workspaceState.convertedFiles && Object.keys(workspaceState.convertedFiles).length > 0) {
      setConvertedFiles(workspaceState.convertedFiles);
    }
    // Ensure uploaded files are synced when workspace state changes
    if (workspaceState.uploadedFiles && Object.keys(workspaceState.uploadedFiles).length > 0) {
      setUploadedFiles(workspaceState.uploadedFiles);
    }
    // Ensure selected file name is synced
    if (workspaceState.selectedFileName && workspaceState.selectedFileName !== selectedFileName) {
      setSelectedFileName(workspaceState.selectedFileName);
    }
  }, [workspaceState.isConverting, workspaceState.showSummary, workspaceState.convertedFiles, workspaceState.uploadedFiles, workspaceState.selectedFileName]);

  const handlePython2CodeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newCode = e.target.value;

    if (selectedFileName) {
      setUploadedFiles(prev => {
        const updated = { ...prev };

        // If the code is empty and this is a generated file (like new_file.py), remove it
        if (!newCode.trim() && selectedFileName === "new_file.py") {
          delete updated[selectedFileName];
          // Clear the selected file name if we're removing the only file
          const remainingFiles = Object.keys(updated);
          if (remainingFiles.length === 0) {
            setSelectedFileName("");
          } else {
            setSelectedFileName(remainingFiles[0]);
          }
        } else {
          updated[selectedFileName] = newCode;
        }

        return updated;
      });
    } else {
      // Only create a new file if the user actually typed something
      if (newCode.trim()) {
        const newFileName = "new_file.py";
        setUploadedFiles({ [newFileName]: newCode });
        setSelectedFileName(newFileName);
      }
    }
  };

  const handleScroll = (source: "left" | "right") => {
    if (!leftPanelRef.current || !rightPanelRef.current) return;
    const sourceRef = source === "left" ? leftPanelRef.current : rightPanelRef.current;
    const targetRef = source === "left" ? rightPanelRef.current : leftPanelRef.current;
    const scrollPercentage = sourceRef.scrollTop / (sourceRef.scrollHeight - sourceRef.clientHeight);
    targetRef.scrollTop = scrollPercentage * (targetRef.scrollHeight - targetRef.clientHeight);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const processZipFile = async (file: File) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      let extractedCount = 0;
      const mode = workspaceState.conversionMode;
      const modeExtMap: Record<string, string[]> = {
        'py2to3': ['.py'],
        'java2py': ['.java'],
        'py2java': ['.py'],
        'cpp2py': ['.cpp', '.cc', '.cxx', '.h', '.hpp'],
        'js2py': ['.js', '.jsx'],
        'ts2py': ['.ts', '.tsx'],
        'cs2py': ['.cs'],
        'rb2py': ['.rb'],
      };
      const validExts = modeExtMap[mode] || ['.py'];

      const entries = Object.entries(zip.files);
      for (const [path, zipEntry] of entries) {
        if (zipEntry.dir) continue;
        const lowerPath = path.toLowerCase();
        const isValid = validExts.some(ext => lowerPath.endsWith(ext));
        if (!isValid) continue;

        const content = await zipEntry.async('string');
        const fileName = path.includes('/') ? path.split('/').pop()! : path;
        setUploadedFiles(prev => {
          const merged = { ...prev, [fileName]: content };
          if (!selectedFileName || Object.keys(prev).length === 0) {
            setSelectedFileName(fileName);
          }
          return merged;
        });
        extractedCount++;
      }

      if (extractedCount > 0) {
        toast(`Extracted ${extractedCount} file(s)`, { description: `From ${file.name}` });
      } else {
        toast('No code files found', { description: 'The zip file did not contain matching source files.' });
      }
    } catch (err) {
      console.error('Failed to process zip file:', err);
      toast('Failed to extract zip', { description: 'The file may be corrupted or not a valid zip.' });
    }
  };

  const SUPPORTED_EXTENSIONS = ['.py', '.java', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.js', '.jsx', '.ts', '.tsx', '.cs', '.rb'];

  const processFile = (file: File) => {
    const name = file.name.toLowerCase();
    if (name.endsWith('.zip')) {
      processZipFile(file);
      return;
    }
    if (!SUPPORTED_EXTENSIONS.some(ext => name.endsWith(ext))) {
      toast('Unsupported file type', { description: 'Supported: .py, .java, .cpp, .js, .ts, .cs, .rb, .zip' });
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result;
      if (typeof text === "string") {
        setUploadedFiles(prev => {
          const merged = { ...prev, [file.name]: text };
          if (!selectedFileName || Object.keys(prev).length === 0) {
            setSelectedFileName(file.name);
          }
          return merged;
        });
      }
    };
    reader.onerror = () => console.error("Could not read file:", reader.error);
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    files.filter(f => {
      const n = f.name.toLowerCase();
      return SUPPORTED_EXTENSIONS.some(ext => n.endsWith(ext)) || n.endsWith('.zip');
    }).forEach(processFile);
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) Array.from(files).forEach(processFile);
    e.target.value = "";
  };

  // Folder import handler
  const handleFolderImport = async () => {
    if (!folderPath.trim()) {
      toast("Please enter a folder path");
      return;
    }
    setIsLoadingFolder(true);
    try {
      const res = await axios.post(`${BACKEND_URL}/api/scan-directory`, { path: folderPath.trim() });
      const { files, total } = res.data;
      if (total === 0) {
        toast("No source files found", { description: "The directory doesn't contain supported code files." });
      } else {
        setUploadedFiles(prev => ({ ...prev, ...files }));
        if (!selectedFileName) {
          setSelectedFileName(Object.keys(files)[0]);
        }
        toast(`Imported ${total} file(s)`, { description: `From ${folderPath}` });
        setFolderModalOpen(false);
        setFolderPath("");
      }
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || "Failed to scan directory";
      toast("Import failed", { description: msg });
    } finally {
      setIsLoadingFolder(false);
    }
  };

  // Persist conversion history
  useEffect(() => {
    try {
      localStorage.setItem('codeRenew_conversionHistory', JSON.stringify(conversionHistory));
    } catch { /* ignore quota errors */ }
  }, [conversionHistory]);

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast("Code copied to clipboard!");
    } catch {
      toast("Failed to copy code.", { description: "Please try again." });
    }
  };

  const handleModernize = async () => {
    if (Object.keys(uploadedFiles).length === 0 && !python2Code.trim()) {
      toast("No code to convert.", { description: "Please upload or paste code." });
      return;
    }
    // Check API connectivity before attempting conversion
    if (!apiConnectivity.isConnected || !apiConnectivity.groqConfigured) {
      toast("API not connected", {
        description: "Please configure your Groq API key in Settings first.",
        action: {
          label: "Go to Settings",
          onClick: () => navigate("/settings")
        }
      });
      return;
    }
    setIsConverting(true);
    setShowSummary(false); // Hide summary during conversion
    const newConvertedFiles: Record<string, string> = {};
    let totalSecurityIssues: SecurityIssue[] = [];
    const conversionsToReport: Array<{
      success: boolean;
      executionTime: number;
      originalCode: string;
      convertedCode: string;
      explanation: string;
      securityIssues: SecurityIssue[];
      fileName: string;
    }> = [];

    const totalFiles = Object.keys(uploadedFiles).length;
    let processedFiles = 0;

    for (const [fileName, fileContent] of Object.entries(uploadedFiles)) {
      processedFiles++;

      // Update toast progress for multi-file conversions
      if (totalFiles > 1) {
        toast(`Converting file ${processedFiles}/${totalFiles}`, {
          description: `Processing ${fileName}...`,
        });
      }

      const startTime = Date.now();
      const modelToUse = selectedModel || 'llama-3.3-70b-versatile';

      try {
        const mode = workspaceState.conversionMode;
        const isConvertMode = mode !== 'py2to3';
        const endpoint = isConvertMode ? `${BACKEND_URL}/convert` : `${BACKEND_URL}/migrate`;
        const payload = isConvertMode
          ? { code: fileContent, filename: fileName, model: modelToUse, mode }
          : { code: fileContent, filename: fileName, model: modelToUse };
        const res = await axios.post(endpoint, payload);
        const endTime = Date.now();

        newConvertedFiles[fileName] = res.data.result || "";

        // Process security issues
        const securityIssues: SecurityIssue[] = res.data.security_issues || [];
        totalSecurityIssues = [...totalSecurityIssues, ...securityIssues];

        // Store conversion report for later (with filename for mapping)
        conversionsToReport.push({
          success: true,
          executionTime: endTime - startTime,
          originalCode: fileContent,
          convertedCode: res.data.result,
          explanation: res.data.explain || "",
          securityIssues: securityIssues,
          fileName: fileName // Add filename to track which file this report belongs to
        });

        // Add a small delay between file conversions to prevent rate limiting
        if (processedFiles < totalFiles) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay between files
        }

        // If there are security issues, show a notification
        if (securityIssues.length > 0) {
          const highSeverityCount = securityIssues.filter(i => i.severity === 'high').length;
          const message = highSeverityCount > 0
            ? `Found ${securityIssues.length} security issues (${highSeverityCount} high severity)`
            : `Found ${securityIssues.length} security issues`;

          toast(message, {
            description: "Click on Security Scan to view details",
            action: {
              label: "View",
              onClick: () => navigate("/security")
            }
          });
        }
      } catch (e) {
        const endTime = Date.now();
        let message = e instanceof Error ? e.message : String(e);
        let isRateLimitError = false;

        // Extract more meaningful error message from axios errors
        if (e && typeof e === 'object' && 'response' in e) {
          const axiosError = e as any;
          if (axiosError.response?.data?.message) {
            message = axiosError.response.data.message;

            // Check for rate limiting error
            if (message.toLowerCase().includes('rate limit') || message.includes('429') ||
              message.toLowerCase().includes('please try again')) {
              isRateLimitError = true;

              // Show specific rate limit toast
              toast("Rate limit reached", {
                description: "Groq API rate limit exceeded. Please wait before converting more files.",
                action: {
                  label: "Learn More",
                  onClick: () => window.open("https://console.groq.com/docs/rate-limits", "_blank")
                }
              });
            }
          } else if (axiosError.response?.status === 500) {
            message = `Server error (500): ${message}. Please check if your Python code has syntax errors.`;
          } else if (axiosError.response?.status === 429) {
            isRateLimitError = true;
            message = "Rate limit exceeded. The AI service is temporarily unavailable due to high usage.";

            toast("Rate limit reached", {
              description: "Too many requests. Please wait a moment before trying again.",
              action: {
                label: "Retry Later",
                onClick: () => {
                  setTimeout(() => {
                    handleModernize();
                  }, 30000); // Retry after 30 seconds
                }
              }
            });
          }
        }

        const errorPrefix = isRateLimitError ? "// Rate limit reached - try again later" : "// Error";
        newConvertedFiles[fileName] = `${errorPrefix}: ${message}`;
        conversionsToReport.push({
          success: false,
          executionTime: endTime - startTime,
          originalCode: fileContent,
          convertedCode: `${errorPrefix}: ${message}`,
          explanation: `Failed to convert ${fileName}: ${message}`,
          securityIssues: [],
          fileName: fileName // Add filename to track which file this report belongs to
        });

        // Log detailed error for debugging
        console.error(`Conversion error for ${fileName}:`, {
          error: e,
          message,
          isRateLimitError,
          status: e && typeof e === 'object' && 'response' in e ? (e as any).response?.status : 'unknown'
        });
      }
    }

    // Update converted files and context state immediately
    setConvertedFiles(newConvertedFiles);
    setIsConverting(false);

    // Update workspace state immediately to ensure converted code appears
    updateWorkspaceState({
      convertedFiles: newConvertedFiles,
      isConverting: false,
      showSummary: false // Will be set to true after reports are added
    });

    // Small delay to add reports and show summary
    setTimeout(() => {
      // Store individual reports in workspace state for file-specific access
      // Create fileReportsMap using the fileName stored in each report
      const fileReportsMap: Record<string, string> = {};
      conversionsToReport.forEach((report) => {
        if (report.fileName && report.explanation) {
          fileReportsMap[report.fileName] = report.explanation;
        }
      });

      // Save conversion history per file
      setConversionHistory(prev => {
        const updated = { ...prev };
        conversionsToReport.forEach((report) => {
          if (!report.fileName || !report.success) return;
          const entry = {
            timestamp: new Date().toISOString(),
            model: selectedModel || 'llama-3.3-70b-versatile',
            originalCode: report.originalCode,
            convertedCode: report.convertedCode,
            explanation: report.explanation,
            mode: workspaceState.conversionMode,
          };
          const existing = updated[report.fileName] || [];
          updated[report.fileName] = [entry, ...existing].slice(0, 20); // keep last 20
        });
        return updated;
      });

      // Update workspace with file-specific explanations
      updateWorkspaceState({
        convertedFiles: newConvertedFiles,
        isConverting: false,
        showSummary: true,
        fileExplanations: fileReportsMap // Store file-specific explanations
      });

      // For multiple files, add only a single consolidated report with actual file count
      if (conversionsToReport.length > 1) {
        const consolidatedReport = {
          success: conversionsToReport.some(r => r.success),
          executionTime: conversionsToReport.reduce((sum, r) => sum + r.executionTime, 0),
          originalCode: `${conversionsToReport.length} files converted`,
          convertedCode: `${conversionsToReport.length} files converted`,
          explanation: conversionsToReport.filter(r => r.explanation).map(r => r.explanation).join('\n\n---\n\n'),
          securityIssues: totalSecurityIssues, // Use the accumulated security issues
          filesCount: conversionsToReport.length // Track actual number of files
        };
        addReport(consolidatedReport);
      } else {
        // For single file, add the individual report with filesCount = 1
        conversionsToReport.forEach(report => {
          const { fileName, ...reportWithoutFileName } = report;
          addReport({ ...reportWithoutFileName, filesCount: 1 });
        });
      }

      setShowSummary(true);

      const successCount = Object.keys(newConvertedFiles).filter(
        key => !newConvertedFiles[key].startsWith('// Error:')
      ).length;

      toast(`${successCount}/${Object.keys(newConvertedFiles).length} file(s) converted successfully.`);
    }, 100);
  };

  const handleDownload = () => {
    const converted = convertedFiles[selectedFileName];
    if (!converted) {
      toast("No converted code to download.", { description: "Please select a file." });
      return;
    }
    const mode = workspaceState.conversionMode;
    let filename: string;
    let mimeType: string;
    if (mode === 'py2java') {
      filename = selectedFileName.replace(/\.py$/, '_converted.java');
      mimeType = 'text/x-java;charset=utf-8';
    } else if (mode === 'java2py') {
      filename = selectedFileName.replace(/\.java$/, '_converted.py');
      mimeType = 'text/x-python;charset=utf-8';
    } else {
      // All other modes output Python
      const ext = selectedFileName.lastIndexOf('.') >= 0 ? selectedFileName.substring(0, selectedFileName.lastIndexOf('.')) : selectedFileName;
      filename = ext + '_converted.py';
      mimeType = 'text/x-python;charset=utf-8';
    }
    saveAs(new Blob([converted], { type: mimeType }), filename);
  };

  // Clear workspace state
  const handleClearWorkspace = () => {
    setUploadedFiles({});
    setConvertedFiles({});
    setSelectedFileName("");
    updateWorkspaceState({
      uploadedFiles: {},
      convertedFiles: {},
      selectedFileName: "",
      githubFiles: null,
      githubDefaultFile: "",
      fileExplanations: {},
    });
    toast("Workspace cleared");
  };

  // GitHub integration methods
  const parseGitHubUrl = (url: string): { owner: string; repo: string } | null => {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)(\/|$)/);
    if (!match) return null;
    return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
  };

  function getGitHubTokenFromSettings(): string | null {
    const settings = localStorage.getItem('legacyCodeModernizer_settings');
    if (!settings) return null;

    try {
      const parsed = JSON.parse(settings);
      return parsed.githubToken || null;
    } catch (err) {
      console.error("Error parsing settings from localStorage:", err);
      return null;
    }
  }

  const fetchGitHubRepo = async () => {
    if (!githubUrl.trim()) {
      toast("Please enter a GitHub URL");
      return;
    }

    const parsed = parseGitHubUrl(githubUrl);
    if (!parsed) {
      toast("Invalid GitHub URL");
      return;
    }

    setIsLoadingRepo(true);
    const { owner, repo } = parsed;
    const token = getGitHubTokenFromSettings();
    try {
      const buildFileTree = async (path = ""): Promise<GitHubFile[]> => {
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
        const headers: Record<string, string> = {};

        // Only add authentication if token exists and is valid (GitHub tokens are typically 40+ chars)
        if (token && token.trim().length > 20) {
          try {
            // Ensure the token is properly encoded for HTTP headers
            const cleanToken = token.trim().replace(/[^\x00-\x7F]/g, '');
            if (cleanToken.length > 20) { // Only use if cleaning didn't remove too much
              headers['Authorization'] = `token ${cleanToken}`;
            }
          } catch (e) {
            console.warn('Token cleaning failed, proceeding without authentication');
          }
        }

        const res = await axios.get(url, { headers });

        const files: GitHubFile[] = [];
        for (const item of res.data) {
          const file: GitHubFile = {
            name: item.name,
            path: item.path,
            type: item.type,
            selected: false,
            expanded: false,
          };

          if (item.type === "dir") {
            file.children = await buildFileTree(item.path);
          } else if (item.name.endsWith(".py")) {
            // Fetch content for Python files
            const fileHeaders: Record<string, string> = {};

            // Only add authentication if token exists and is valid
            if (token && token.trim().length > 20) {
              try {
                // Ensure the token is properly encoded for HTTP headers
                const cleanToken = token.trim().replace(/[^\x00-\x7F]/g, '');
                if (cleanToken.length > 20) { // Only use if cleaning didn't remove too much
                  fileHeaders['Authorization'] = `token ${cleanToken}`;
                }
              } catch (e) {
                console.warn('Token cleaning failed, proceeding without authentication');
              }
            }

            const fileRes = await axios.get(item.url, { headers: fileHeaders });
            file.content = atob(fileRes.data.content);
          }

          files.push(file);
        }
        return files;
      };

      const files = await buildFileTree();
      setGithubFileTree(files);
      toast("Repository loaded successfully!");
    } catch (error) {
      console.error("Failed to fetch repository:", error);
      setRepoLoadFailed(true);
      toast("Failed to load repository", {
        description: "Please check the URL or authenticate with GitHub"
      });
    } finally {
      setIsLoadingRepo(false);
    }
  };

  const toggleFileSelection = (path: string) => {
    const updateSelection = (files: GitHubFile[]): GitHubFile[] => {
      return files.map(file => {
        if (file.path === path) {
          return { ...file, selected: !file.selected };
        }
        if (file.children) {
          return { ...file, children: updateSelection(file.children) };
        }
        return file;
      });
    };
    setGithubFileTree(updateSelection(githubFileTree));
  };

  const toggleFolderExpansion = (path: string) => {
    const updateExpansion = (files: GitHubFile[]): GitHubFile[] => {
      return files.map(file => {
        if (file.path === path && file.type === 'dir') {
          return { ...file, expanded: !file.expanded };
        }
        if (file.children) {
          return { ...file, children: updateExpansion(file.children) };
        }
        return file;
      });
    };
    setGithubFileTree(updateExpansion(githubFileTree));
  };

  const importSelectedFiles = () => {
    const getSelectedFiles = (files: GitHubFile[]): Record<string, string> => {
      let selected: Record<string, string> = {};
      for (const file of files) {
        if (file.selected && file.type === 'file' && file.content) {
          selected[file.name] = file.content;
        }
        if (file.children) {
          selected = { ...selected, ...getSelectedFiles(file.children) };
        }
      }
      return selected;
    };

    const selectedFiles = getSelectedFiles(githubFileTree);
    if (Object.keys(selectedFiles).length === 0) {
      toast("No files selected", { description: "Please select Python files to import." });
      return;
    }

    setUploadedFiles(prev => ({ ...prev, ...selectedFiles }));
    if (!selectedFileName) {
      setSelectedFileName(Object.keys(selectedFiles)[0]);
    }
    setGithubModalOpenPython2(false);
    toast(`Imported ${Object.keys(selectedFiles).length} file(s)`);
  };

  const fetchRepos = async (token: string) => {
    const actualToken = getGitHubTokenFromSettings();
    if (actualToken) {
      // Ensure the token is properly encoded for HTTP headers
      const cleanToken = actualToken.trim().replace(/[^\x00-\x7F]/g, '');
      const res = await axios.get("https://api.github.com/user/repos", {
        headers: { Authorization: `token ${cleanToken}` },
      });
      setRepos(res.data);
    }
  };

  const handleLogin = () => {
    window.open(`${BACKEND_URL}/github/login`, "_blank", "width=600,height=700");
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "github_token" && event.data?.token) {
        setAccessToken(event.data.token);
        fetchRepos(event.data.token);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Get security issues for a specific file
  const getFileSecurityIssues = (fileName: string): SecurityIssue[] => {
    if (!latestReport) return [];
    return latestReport.securityIssues.filter(issue => issue.file === fileName);
  };

  // Get highest severity for a file
  const getFileHighestSeverity = (fileName: string): 'high' | 'medium' | 'low' | null => {
    const issues = getFileSecurityIssues(fileName);
    if (issues.length === 0) return null;

    if (issues.some(issue => issue.severity === 'high')) return 'high';
    if (issues.some(issue => issue.severity === 'medium')) return 'medium';
    return 'low';
  };

  // Render the file sidebar
  const renderFileSidebar = () => {
    const fileNames = Object.keys(uploadedFiles);
    if (fileNames.length <= 1) return null;

    return (
      <div className={`bg-gray-950 border-r border-gray-800/50 rounded-l-2xl transition-all duration-300 ${sidebarCollapsed ? 'w-12' : 'w-56'} flex flex-col`}>
        {/* Sidebar Header */}
        <div className="px-3 py-3 border-b border-gray-800 flex items-center justify-between">
          {!sidebarCollapsed && (
            <h3 className="text-[11px] font-medium text-gray-400 flex items-center gap-2 uppercase tracking-wider">
              <Folder size={14} className="text-gray-500" />
              Files ({fileNames.length})
            </h3>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1 hover:bg-gray-800 rounded-lg text-gray-500 hover:text-gray-300 transition-colors"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* File List */}
        <div className="flex-1 overflow-y-auto py-1">
          {fileNames.map((fileName) => {
            const isActive = fileName === selectedFileName;
            const hasConverted = fileName in convertedFiles;
            const severity = getFileHighestSeverity(fileName);
            const issuesCount = getFileSecurityIssues(fileName).length;
            const historyCount = (conversionHistory[fileName] || []).length;

            return (
              <div
                key={fileName}
                onClick={() => setSelectedFileName(fileName)}
                className={`px-3 py-2 cursor-pointer border-l-2 transition-all duration-150 ${
                  isActive
                    ? 'bg-blue-500/10 border-l-blue-400 text-white'
                    : 'border-l-transparent text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
                } ${sidebarCollapsed ? 'px-2' : ''}`}
                title={sidebarCollapsed ? fileName : ''}
              >
                <div className="flex items-center gap-2">
                  <div className="flex-shrink-0">
                    <FileCode
                      size={14}
                      className={isActive ? 'text-blue-400' : 'text-gray-500'}
                    />
                  </div>

                  {!sidebarCollapsed && (
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">
                        {fileName}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {hasConverted && (
                          <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                            <Shield size={8} />
                            Done
                          </span>
                        )}
                        {severity && (
                          <span className={`text-[10px] flex items-center gap-0.5 ${
                            severity === 'high' ? 'text-red-400' :
                            severity === 'medium' ? 'text-orange-400' : 'text-yellow-400'
                          }`}>
                            <AlertCircle size={8} />
                            {issuesCount}
                          </span>
                        )}
                        {historyCount > 0 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setShowHistoryFor(showHistoryFor === fileName ? null : fileName); }}
                            className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-0.5"
                            title={`${historyCount} conversion(s)`}
                          >
                            <History size={8} />
                            {historyCount}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {sidebarCollapsed && (
                    <div className="flex flex-col items-center gap-1">
                      {hasConverted && (
                        <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" title="Converted" />
                      )}
                      {severity && (
                        <div className={`w-1.5 h-1.5 rounded-full ${severity === 'high' ? 'bg-red-400' :
                            severity === 'medium' ? 'bg-orange-400' : 'bg-yellow-400'
                          }`} title={`${issuesCount} ${severity} severity issues`} />
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderFileTree = (files: GitHubFile[], depth = 0): React.ReactNode => {
    return files.map(file => (
      <div key={file.path} style={{ marginLeft: `${depth * 16}px` }}>
        <div className="flex items-center py-1 hover:bg-muted/50 rounded px-2">
          {file.type === 'dir' ? (
            <>
              <button
                onClick={() => toggleFolderExpansion(file.path)}
                className="mr-1 p-1 hover:bg-muted rounded"
              >
                {file.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              <Folder size={16} className="mr-2 text-blue-500" />
              <span className="text-sm">{file.name}</span>
            </>
          ) : (
            <>
              <div className="w-6"></div>
              {file.name.endsWith('.py') && (
                <input
                  type="checkbox"
                  checked={file.selected || false}
                  onChange={() => toggleFileSelection(file.path)}
                  className="mr-2"
                />
              )}
              <File size={16} className="mr-2 text-gray-500" />
              <span className="text-sm">{file.name}</span>
            </>
          )}
        </div>
        {file.type === 'dir' && file.expanded && file.children && (
          <div>
            {renderFileTree(file.children, depth + 1)}
          </div>
        )}
      </div>
    ));
  };

  // Check GitHub authentication status
  const checkGitHubAuth = async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/github/health`);
      const isAuthenticated = response.data.connected && response.data.github_configured;
      setGithubAuthenticated(isAuthenticated);
      setRepoLoadFailed(!isAuthenticated);
      return isAuthenticated;
    } catch (error) {
      console.error("GitHub connectivity check failed:", error);
      setGithubAuthenticated(false);
      setRepoLoadFailed(true);
      return false;
    }
  };

  // Check authentication on component mount
  useEffect(() => {
    if (githubAuthenticated === null) {
      checkGitHubAuth();
    }
  }, []);

  // Re-check GitHub authentication when returning to the page/tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && githubAuthenticated === false) {
        // Re-check authentication when user returns to the tab
        // This helps if they configured GitHub token in another tab/window
        checkGitHubAuth();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [githubAuthenticated]);

  const handlePushToGitHub = async () => {
    // Check GitHub authentication
    const isAuth = await checkGitHubAuth();
    if (!isAuth) {
      toast("GitHub authentication required", {
        description: "Please configure your GitHub Personal Access Token in Settings.",
        action: {
          label: "Go to Settings",
          onClick: () => navigate("/settings")
        }
      });
      return;
    }
    if (!repoInput.trim()) {
      toast("Please enter a repository name.");
      return;
    }

    const parsed = parseGitHubUrl(`https://github.com/${repoInput}`);
    if (!parsed) {
      toast("Invalid repository format");
      return;
    }

    const normalizedFolder = targetPath.replace(/\/+$/, "");

    try {
      console.log("Attempting GitHub commit with repo:", `${parsed.owner}/${parsed.repo}`);

      const response = await axios.post(`${BACKEND_URL}/github/commit`, {
        repo: `${parsed.owner}/${parsed.repo}`,
        message: commitMessage || `Add converted files to ${normalizedFolder}/`,
        files: Object.entries(convertedFiles).map(([fileName, fileContent]) => ({
          path: `${normalizedFolder}/${fileName}`,
          content: fileContent
        }))
      });

      console.log("GitHub commit response:", response.data);
      toast("Successfully pushed to GitHub!");
      setGithubModalOpenPython3(false);

    } catch (err: any) {
      console.error("GitHub commit error:", err);

      // More specific error handling
      if (err.response) {
        const status = err.response.status;
        const message = err.response.data?.error || err.response.data?.message || "Unknown error";

        if (status === 401) {
          toast("Authentication failed", {
            description: "Please update your GitHub Personal Access Token in Settings.",
            action: {
              label: "Go to Settings",
              onClick: () => navigate("/settings")
            }
          });
        } else if (status === 403) {
          toast("Access denied", {
            description: "Check if your token has the required permissions for this repository.",
          });
        } else if (status === 404) {
          toast("Repository not found", {
            description: "Please check the repository name and your access permissions.",
          });
        } else {
          toast("Failed to push to GitHub", {
            description: `Error ${status}: ${message}`,
          });
        }
      } else if (err.request) {
        toast("Network error", {
          description: "Unable to connect to GitHub. Please check your internet connection.",
        });
      } else {
        toast("Failed to push to GitHub", {
          description: err.message || "Unknown error occurred.",
        });
      }
    }
  };




  return (
    <div className="p-6 bg-gradient-to-br from-slate-50 via-gray-50 to-blue-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header Card */}
        <div className="mb-6 bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-gray-200/60 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">Code Workspace</h2>
              <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Using {getCurrentModelName()}
              </p>
            </div>

            {/* Mode Selector */}
            <select
              value={workspaceState.conversionMode}
              onChange={(e) => updateWorkspaceState({ conversionMode: e.target.value as WorkspaceState['conversionMode'] })}
              className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="py2to3">Python 2 → Python 3</option>
              <option value="java2py">Java → Python</option>
              <option value="py2java">Python → Java</option>
              <option value="cpp2py">C++ → Python</option>
              <option value="js2py">JavaScript → Python</option>
              <option value="ts2py">TypeScript → Python</option>
              <option value="cs2py">C# → Python</option>
              <option value="rb2py">Ruby → Python</option>
            </select>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleClearWorkspace}
                className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-2 rounded-lg transition-colors"
                title="Clear workspace"
              >
                <X size={18} />
              </button>
              <button
                onClick={handleModernize}
                disabled={isConverting || !apiConnectivity.isConnected || !apiConnectivity.groqConfigured}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-5 py-2 rounded-xl hover:from-blue-700 hover:to-indigo-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow-sm shadow-blue-200 transition-all duration-200 hover:shadow-md hover:shadow-blue-200"
                title={!apiConnectivity.isConnected || !apiConnectivity.groqConfigured ? "API not connected. Please configure your Groq API key in Settings." : ""}
              >
                {isConverting ? <RotateCcw size={15} className="animate-spin" /> : <Play size={15} />}
                {isConverting ? (
                  Object.keys(uploadedFiles).length > 1
                    ? "Converting..."
                    : "Converting..."
                ) : workspaceState.conversionMode === 'py2to3' ? "Convert to Python 3"
                  : workspaceState.conversionMode === 'java2py' ? "Convert to Python"
                    : workspaceState.conversionMode === 'py2java' ? "Convert to Java"
                      : "Convert"}
              </button>
            </div>
          </div>
          {(!apiConnectivity.isConnected || !apiConnectivity.groqConfigured) && (
            <div className="mt-3 flex items-center gap-2 text-amber-700 text-xs bg-amber-50 border border-amber-200/60 rounded-lg px-3 py-2">
              <AlertCircle size={14} />
              <span>API not connected. Configure your Groq API key in Settings.</span>
              <button
                onClick={() => navigate("/settings")}
                className="ml-auto text-blue-600 hover:text-blue-800 font-medium"
              >
                Settings →
              </button>
            </div>
          )}
        </div>

        {/* Security Alert Banner */}
        {latestReport && latestReport.securityIssues.length > 0 && (
          <div className="mb-4 p-3 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/60 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-amber-100/80 p-2 rounded-xl">
                <AlertTriangle size={18} className="text-amber-600" />
              </div>
              <div>
                <h4 className="font-semibold text-amber-800 text-sm">Security Issues Detected</h4>
                <p className="text-xs text-amber-600">
                  {latestReport.securityIssues.length} issue(s) found in converted code
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate("/security")}
              className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700 transition-colors"
            >
              View Details
            </button>
          </div>
        )}

        <div className="flex gap-4 h-[62vh]">
          {/* File Sidebar */}
          {renderFileSidebar()}

          {/* Main Content Area */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Source Panel */}
            <div className="bg-gray-950 rounded-2xl shadow-lg border border-gray-800/50 flex flex-col overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between bg-gray-900/80 border-b border-gray-800">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    workspaceState.conversionMode === 'py2to3' ? 'bg-red-400' :
                    workspaceState.conversionMode === 'java2py' ? 'bg-orange-400' :
                    workspaceState.conversionMode === 'py2java' ? 'bg-blue-400' :
                    workspaceState.conversionMode === 'cpp2py' ? 'bg-purple-400' :
                    workspaceState.conversionMode === 'js2py' ? 'bg-yellow-400' :
                    workspaceState.conversionMode === 'ts2py' ? 'bg-cyan-400' :
                    workspaceState.conversionMode === 'cs2py' ? 'bg-green-400' :
                    'bg-pink-400'
                  }`}></span>
                  <h3 className="text-xs font-medium text-gray-300 tracking-wide uppercase">
                    {{
                      py2to3: 'Python 2 — Source',
                      java2py: 'Java — Source',
                      py2java: 'Python — Source',
                      cpp2py: 'C++ — Source',
                      js2py: 'JavaScript — Source',
                      ts2py: 'TypeScript — Source',
                      cs2py: 'C# — Source',
                      rb2py: 'Ruby — Source',
                    }[workspaceState.conversionMode]}
                  </h3>
                  {selectedFileName && (
                    <span className="text-[10px] text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{selectedFileName}</span>
                  )}
                </div>
                <div className="flex gap-1.5">
                  <Dialog open={githubModalOpenPython2} onOpenChange={setGithubModalOpenPython2}>
                    <DialogTrigger asChild>
                      <button className="text-gray-400 hover:text-white px-2.5 py-1 rounded-lg text-xs hover:bg-gray-800 flex items-center gap-1 transition-colors">
                        <Github size={12} /> Import
                      </button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-hidden flex flex-col">
                      <DialogHeader>
                        <DialogTitle>Import from GitHub</DialogTitle>
                        <DialogDescription>
                          Enter a GitHub repository URL to browse and select files
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
                        <div className="flex gap-2">
                          <div className="flex-1 relative">
                            <input
                              type="text"
                              placeholder="https://github.com/username/repository"
                              value={githubUrl}
                              onChange={(e) => setGithubUrl(e.target.value)}
                              className="w-full px-3 py-2 border rounded-md text-sm"
                            />
                            {githubUrl && (
                              <button
                                onClick={() => setGithubUrl("")}
                                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                              >
                                <X size={16} />
                              </button>
                            )}
                          </div>
                          <button
                            onClick={fetchGitHubRepo}
                            disabled={isLoadingRepo}
                            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
                          >
                            {isLoadingRepo ? <RotateCcw size={16} className="animate-spin" /> : "Load"}
                          </button>
                          {repoLoadFailed && (
                            <button
                              onClick={() => {
                                setRepoLoadFailed(false);
                                setGithubAuthenticated(null); // Reset auth status to trigger re-check
                                navigate("/settings")
                              }}
                              className="ml-2 px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700"
                            >
                              Authenticate
                            </button>
                          )}
                        </div>

                        {githubFileTree.length > 0 && (
                          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
                            <div className="border rounded-md p-4 flex-1 overflow-y-auto">
                              <div className="text-sm font-medium mb-2">Repository Structure</div>
                              {renderFileTree(githubFileTree)}
                            </div>
                            <div className="flex justify-between pt-4 border-t">
                              <DialogClose asChild>
                                <button className="px-4 py-2 border rounded-md text-sm hover:bg-muted">
                                  Cancel
                                </button>
                              </DialogClose>
                              <button
                                onClick={importSelectedFiles}
                                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
                              >
                                Import Selected Files
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                  <button onClick={() => fileInputRef.current?.click()} className="text-gray-400 hover:text-white px-2.5 py-1 rounded-lg text-xs hover:bg-gray-800 flex items-center gap-1 transition-colors">
                    <FolderOpen size={12} /> Upload
                  </button>
                  <Dialog open={folderModalOpen} onOpenChange={setFolderModalOpen}>
                    <DialogTrigger asChild>
                      <button className="text-gray-400 hover:text-white px-2.5 py-1 rounded-lg text-xs hover:bg-gray-800 flex items-center gap-1 transition-colors">
                        <FolderInput size={12} /> Folder
                      </button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[450px]">
                      <DialogHeader>
                        <DialogTitle>Import Local Directory</DialogTitle>
                        <DialogDescription>
                          Enter the full path to a folder to recursively scan for source files.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <input
                          type="text"
                          placeholder="C:\Projects\my-app  or  /home/user/projects/app"
                          value={folderPath}
                          onChange={(e) => setFolderPath(e.target.value)}
                          className="w-full px-3 py-2 border rounded-md text-sm"
                          onKeyDown={(e) => e.key === 'Enter' && handleFolderImport()}
                        />
                        <div className="flex justify-end gap-2">
                          <DialogClose asChild>
                            <button className="px-4 py-2 border rounded-md text-sm hover:bg-muted">Cancel</button>
                          </DialogClose>
                          <button
                            onClick={handleFolderImport}
                            disabled={isLoadingFolder}
                            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                          >
                            {isLoadingFolder ? <RotateCcw size={14} className="animate-spin" /> : <FolderInput size={14} />}
                            {isLoadingFolder ? "Scanning..." : "Import"}
                          </button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <input ref={fileInputRef} type="file" style={{ display: "none" }} accept=".py,.java,.cpp,.cc,.cxx,.h,.hpp,.js,.jsx,.ts,.tsx,.cs,.rb,.zip" onChange={handleUpload} multiple />
                </div>
              </div>
              <div className="flex-1 relative">
                <textarea
                  ref={leftPanelRef}
                  value={python2Code}
                  onChange={handlePython2CodeChange}
                  onScroll={() => handleScroll("left")}
                  className="w-full h-full p-4 font-mono text-[13px] leading-relaxed bg-transparent text-emerald-400 resize-none focus:outline-none placeholder:text-gray-600"
                  placeholder={
                    workspaceState.conversionMode === 'py2to3' ? 'Paste or upload Python 2 code...' :
                    workspaceState.conversionMode === 'java2py' ? 'Paste or upload Java code...' :
                    workspaceState.conversionMode === 'py2java' ? 'Paste or upload Python code...' :
                    workspaceState.conversionMode === 'cpp2py' ? 'Paste or upload C++ code...' :
                    workspaceState.conversionMode === 'js2py' ? 'Paste or upload JavaScript code...' :
                    workspaceState.conversionMode === 'ts2py' ? 'Paste or upload TypeScript code...' :
                    workspaceState.conversionMode === 'cs2py' ? 'Paste or upload C# code...' :
                    'Paste or upload Ruby code...'
                  }
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                />
                {dragOver && (
                  <div className="absolute inset-0 bg-blue-500/10 border-2 border-dashed border-blue-400/50 rounded-xl flex items-center justify-center backdrop-blur-sm">
                    <div className="text-blue-300 font-medium text-sm">Drop source files here</div>
                  </div>
                )}
                <button onClick={() => handleCopy(python2Code)} className="absolute top-2 right-2 p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
                  <Copy size={13} />
                </button>
              </div>
            </div>

            {/* Output Panel */}
            <div className="bg-gray-950 rounded-2xl shadow-lg border border-gray-800/50 flex flex-col overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between bg-gray-900/80 border-b border-gray-800">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    workspaceState.conversionMode === 'py2java' ? 'bg-orange-400' : 'bg-emerald-400'
                  }`}></span>
                  <h3 className="text-xs font-medium text-gray-300 tracking-wide uppercase">
                    {workspaceState.conversionMode === 'py2java' ? 'Java — Output' :
                      workspaceState.conversionMode === 'py2to3' ? 'Python 3 — Output' : 'Python — Output'}
                  </h3>
                </div>
                <div className="flex gap-1.5">
                  <Dialog open={githubModalOpenPython3} onOpenChange={setGithubModalOpenPython3}>
                    <DialogTrigger asChild>
                      <button className="text-gray-400 hover:text-white px-2.5 py-1 rounded-lg text-xs hover:bg-gray-800 flex items-center gap-1 transition-colors">
                        <Github size={12} /> Commit
                      </button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[500px]">
                      <DialogHeader>
                        <DialogTitle>Export Converted File to GitHub</DialogTitle>
                        <DialogDescription> Push the converted code to a repository of your choice. </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Repository (e.g. user/repo)</label>
                          <input
                            type="text"
                            value={repoInput}
                            onChange={(e) => setRepoInput(e.target.value)}
                            placeholder="username/repo"
                            className="w-full px-3 py-2 border rounded-md text-sm"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Target Path in Repo</label>
                          <input
                            type="text"
                            value={targetPath}
                            onChange={(e) => setTargetPath(e.target.value)}
                            className="w-full px-3 py-2 border rounded-md text-sm"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Commit Message</label>
                          <input
                            type="text"
                            value={commitMessage}
                            onChange={(e) => setCommitMessage(e.target.value)}
                            className="w-full px-3 py-2 border rounded-md text-sm"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 mt-6">
                        <DialogClose asChild>

                        </DialogClose>
                        {repoLoadFailed && (
                          <button
                            onClick={() => {
                              setRepoLoadFailed(false);
                              setGithubAuthenticated(null); // Reset auth status to trigger re-check
                              navigate("/settings")
                            }}
                            className="ml-2 px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700"
                          >
                            Authenticate
                          </button>
                        )}
                        <button
                          onClick={handlePushToGitHub}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
                        >
                          Push to GitHub
                        </button>
                      </div>
                    </DialogContent>

                  </Dialog>

                  <button onClick={handleDownload} className="text-gray-400 hover:text-white px-2.5 py-1 rounded-lg text-xs hover:bg-gray-800 flex items-center gap-1 transition-colors">
                    <Download size={12} /> Save
                  </button>
                </div>
              </div>
              <div className="flex-1 relative">
                <textarea
                  ref={rightPanelRef}
                  value={python3Code}
                  readOnly
                  onScroll={() => handleScroll("right")}
                  className="w-full h-full p-4 font-mono text-[13px] leading-relaxed bg-transparent text-sky-400 resize-none focus:outline-none placeholder:text-gray-600"
                  placeholder="Converted code will appear here..."
                />
                <button onClick={() => handleCopy(python3Code)} className="absolute top-2 right-2 p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
                  <Copy size={13} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Conversion History Panel */}
        {showHistoryFor && conversionHistory[showHistoryFor] && conversionHistory[showHistoryFor].length > 0 && (
          <div className="mt-4 bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-gray-200/60 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gradient-to-r from-violet-50/50 to-purple-50/50 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <History size={16} className="text-violet-500" />
                Conversion History — {showHistoryFor}
              </h4>
              <button onClick={() => setShowHistoryFor(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
                <X size={14} />
              </button>
            </div>
            <div className="p-4 space-y-3 max-h-64 overflow-y-auto">
              {conversionHistory[showHistoryFor].map((entry, idx) => (
                <div
                  key={idx}
                  className="p-3 border rounded-xl hover:bg-gray-50 cursor-pointer transition-colors group"
                  onClick={() => {
                    setConvertedFiles(prev => ({ ...prev, [showHistoryFor!]: entry.convertedCode }));
                    setSelectedFileName(showHistoryFor!);
                    updateWorkspaceState({
                      convertedFiles: { ...convertedFiles, [showHistoryFor!]: entry.convertedCode },
                      fileExplanations: { ...workspaceState.fileExplanations, [showHistoryFor!]: entry.explanation },
                      showSummary: true,
                    });
                    setShowSummary(true);
                    toast("Restored from history", { description: `${new Date(entry.timestamp).toLocaleString()}` });
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-700">
                        {new Date(entry.timestamp).toLocaleString()}
                      </span>
                      <span className="text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">{entry.mode}</span>
                    </div>
                    <span className="text-[10px] text-gray-400 group-hover:text-blue-500 transition-colors">
                      Click to restore
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 truncate">
                    Model: {entry.model} — {entry.explanation.split('\n')[0]?.substring(0, 80)}...
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Change Explanation Panel */}
        <div className="mt-4 bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-gray-200/60 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gradient-to-r from-blue-50/50 to-indigo-50/50">
            <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              Conversion Summary
            </h4>
          </div>
          <div className="p-5">
            {codeChanges && showSummary ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                  <span className="text-xs font-medium text-gray-500">
                    Changes applied to <span className="text-gray-800">{selectedFileName}</span>
                  </span>
                </div>
                <div className="relative">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 to-indigo-500 rounded-full"></div>
                  <div className="pl-6 space-y-3">
                    {(() => {
                      const lines = codeChanges.split('\n').filter(line => line.trim());
                      const processedContent: React.ReactNode[] = [];
                      let currentSection: { header: string; items: string[] } | null = null;

                      const renderInlineMarkdown = (text: string): React.ReactNode => {
                        // Replace **text** with bold
                        let processed = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
                        // Replace `code` with inline code
                        processed = processed.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 bg-gray-100 text-gray-800 rounded text-xs font-mono">$1</code>');

                        return <span dangerouslySetInnerHTML={{ __html: processed }} />;
                      };

                      lines.forEach((line, index) => {
                        const trimmedLine = line.trim();

                        // Check if it's a header (ends with ** and starts with **)
                        if (trimmedLine.startsWith('**') && trimmedLine.endsWith('**') && trimmedLine.match(/\*\*/g)?.length === 2) {
                          // Save previous section if exists
                          if (currentSection && currentSection.items.length > 0) {
                            processedContent.push(
                              <div key={`section-${processedContent.length}`} className="mb-4">
                                <h5 className="text-sm font-semibold text-gray-900 mb-2">
                                  {currentSection.header}
                                </h5>
                                <div className="space-y-2 ml-4">
                                  {currentSection.items.map((item, idx) => (
                                    <div key={idx} className="flex items-start gap-2">
                                      <div className="mt-1.5 flex-shrink-0">
                                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div>
                                      </div>
                                      <p className="text-sm text-gray-700 leading-relaxed flex-1">
                                        {renderInlineMarkdown(item)}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          }

                          // Start new section
                          const headerText = trimmedLine.replace(/\*\*/g, '').trim();
                          currentSection = { header: headerText, items: [] };
                        }
                        // Check if it's a main bullet point (starts with * or -)
                        else if (trimmedLine.startsWith('*') || trimmedLine.startsWith('-')) {
                          const content = trimmedLine.substring(1).trim();

                          // If we're in a section, add as sub-item
                          if (currentSection) {
                            currentSection.items.push(content);
                          } else {
                            // Otherwise, add as main bullet point
                            processedContent.push(
                              <div key={`bullet-${index}`} className="flex items-start gap-3 group">
                                <div className="mt-1.5 flex-shrink-0">
                                  <div className="w-2 h-2 bg-blue-500 rounded-full group-hover:ring-4 group-hover:ring-blue-100 transition-all"></div>
                                </div>
                                <p className="text-sm text-gray-700 leading-relaxed flex-1">
                                  {renderInlineMarkdown(content)}
                                </p>
                              </div>
                            );
                          }
                        }
                        // Check if it's a sub-item (starts with spaces/tabs)
                        else if (currentSection && (line.startsWith('  ') || line.startsWith('\t'))) {
                          currentSection.items.push(trimmedLine);
                        }
                        // Regular text or unformatted content
                        else if (trimmedLine) {
                          // Close current section if exists
                          if (currentSection && currentSection.items.length > 0) {
                            processedContent.push(
                              <div key={`section-${processedContent.length}`} className="mb-4">
                                <h5 className="text-sm font-semibold text-gray-900 mb-2">
                                  {currentSection.header}
                                </h5>
                                <div className="space-y-2 ml-4">
                                  {currentSection.items.map((item, idx) => (
                                    <div key={idx} className="flex items-start gap-2">
                                      <div className="mt-1.5 flex-shrink-0">
                                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div>
                                      </div>
                                      <p className="text-sm text-gray-700 leading-relaxed flex-1">
                                        {renderInlineMarkdown(item)}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                            currentSection = null;
                          }

                          // Add as regular paragraph
                          processedContent.push(
                            <p key={`para-${index}`} className="text-sm text-gray-600 leading-relaxed">
                              {renderInlineMarkdown(trimmedLine)}
                            </p>
                          );
                        }
                      });

                      // Don't forget to add the last section if it exists
                      if (currentSection && currentSection.items.length > 0) {
                        processedContent.push(
                          <div key={`section-${processedContent.length}`} className="mb-4">
                            <h5 className="text-sm font-semibold text-gray-900 mb-2">
                              {currentSection.header}
                            </h5>
                            <div className="space-y-2 ml-4">
                              {currentSection.items.map((item, idx) => (
                                <div key={idx} className="flex items-start gap-2">
                                  <div className="mt-1.5 flex-shrink-0">
                                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div>
                                  </div>
                                  <p className="text-sm text-gray-700 leading-relaxed flex-1">
                                    {renderInlineMarkdown(item)}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }

                      return processedContent;
                    })()}
                  </div>
                </div>

                {/* Success indicator */}
                <div className="mt-5 flex items-center gap-2 text-emerald-600 bg-emerald-50/60 px-4 py-2.5 rounded-xl border border-emerald-100">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-xs font-medium">Conversion completed successfully</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-10">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <p className="text-gray-400 text-sm font-medium">
                  No conversion summary yet
                </p>
                <p className="text-gray-300 text-xs mt-1">
                  Run a conversion to see detailed changes
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CodeWorkspace;