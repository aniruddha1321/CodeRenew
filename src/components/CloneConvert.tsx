import React, { useState, useCallback, useRef, useEffect } from "react";
import {
    GitBranch,
    Download,
    Search,
    CheckCircle,
    XCircle,
    ChevronRight,
    ChevronDown,
    FileText,
    Folder,
    RotateCcw,
    ExternalLink,
    AlertCircle,
    Loader2,
    Network,
} from "lucide-react";
import axios from "axios";
import { toast } from "@/components/ui/sonner";
import { useAppContext } from "@/context/AppContext";
import { useNavigate } from "react-router-dom";
import KnowledgeGraph from "./KnowledgeGraph";

const BACKEND_URL = "http://localhost:5000";

type WizardStep = "input" | "scanning" | "select" | "converting" | "push" | "done";

interface ScannedFile {
    name: string;
    path: string;
    extension: string;
    size: number;
    language: string;
    selected: boolean;
}

interface ConvertedFile {
    path: string;
    new_path: string;
    status: string;
    converted_code?: string;
    explanation?: string;
    error?: string;
}

const CloneConvert: React.FC = () => {
    const navigate = useNavigate();
    const { selectedModel, apiConnectivity } = useAppContext();

    // Wizard state
    const [step, setStep] = useState<WizardStep>("input");
    const [repoUrl, setRepoUrl] = useState("");
    const [repoName, setRepoName] = useState("");
    const [repoPath, setRepoPath] = useState("");
    const [defaultBranch, setDefaultBranch] = useState("main");
    const [conversionMode, setConversionMode] = useState<"py2to3" | "java2py" | "py2java">("py2to3");

    // File state
    const [scannedFiles, setScannedFiles] = useState<ScannedFile[]>([]);
    const [pythonCount, setPythonCount] = useState(0);
    const [javaCount, setJavaCount] = useState(0);

    // Conversion state
    const [convertedFiles, setConvertedFiles] = useState<ConvertedFile[]>([]);
    const [convertProgress, setConvertProgress] = useState(0);
    const [convertTotal, setConvertTotal] = useState(0);

    // Push state
    const [branchName, setBranchName] = useState("modernized-code");
    const [commitMessage, setCommitMessage] = useState("Automated code conversion by Code Renew");
    const [prUrl, setPrUrl] = useState<string | null>(null);
    const [isPushing, setIsPushing] = useState(false);

    // Knowledge graph state
    const [showGraph, setShowGraph] = useState(false);
    const [graphData, setGraphData] = useState<any>(null);
    const [isLoadingGraph, setIsLoadingGraph] = useState(false);

    // Loading states
    const [isCloning, setIsCloning] = useState(false);

    const handleClone = async () => {
        if (!repoUrl.trim()) {
            toast("Please enter a repository URL");
            return;
        }
        if (!apiConnectivity.isConnected) {
            toast("API not connected", { description: "Configure your Groq API key in Settings." });
            return;
        }

        setIsCloning(true);
        setStep("scanning");

        try {
            const res = await axios.post(`${BACKEND_URL}/github/clone`, {
                repo_url: repoUrl.trim(),
            });

            const data = res.data;
            setRepoName(data.repo_name);
            setRepoPath(data.repo_path);
            setDefaultBranch(data.default_branch || "main");
            setPythonCount(data.python_count);
            setJavaCount(data.java_count);

            const filesWithSelection = data.files.map((f: any) => ({ ...f, selected: true }));
            setScannedFiles(filesWithSelection);
            setStep("select");
            toast(`Cloned successfully`, { description: `Found ${data.total_files} code files` });
        } catch (err: any) {
            const msg = err.response?.data?.error || err.message || "Clone failed";
            toast("Clone failed", { description: msg });
            setStep("input");
        } finally {
            setIsCloning(false);
        }
    };

    const handleLoadGraph = async () => {
        if (!repoPath) return;
        setIsLoadingGraph(true);
        try {
            const res = await axios.post(`${BACKEND_URL}/analyze/knowledge-graph`, {
                repo_path: repoPath,
            });
            setGraphData(res.data);
            setShowGraph(true);
        } catch (err: any) {
            toast("Knowledge graph failed", { description: err.response?.data?.error || err.message });
        } finally {
            setIsLoadingGraph(false);
        }
    };

    const handleBulkConvert = async () => {
        const selected = scannedFiles.filter(f => f.selected);
        if (selected.length === 0) {
            toast("No files selected", { description: "Select at least one file to convert." });
            return;
        }

        setStep("converting");
        setConvertTotal(selected.length);
        setConvertProgress(0);

        try {
            const res = await axios.post(`${BACKEND_URL}/github/bulk-convert`, {
                repo_path: repoPath,
                file_paths: selected.map(f => f.path),
                mode: conversionMode,
                model: selectedModel || "llama-3.3-70b-versatile",
            });

            setConvertedFiles(res.data.results || []);
            setConvertProgress(selected.length);
            setStep("push");

            const successCount = res.data.success_count || 0;
            toast(`Conversion complete`, {
                description: `${successCount}/${selected.length} files converted successfully`,
            });
        } catch (err: any) {
            toast("Conversion failed", { description: err.response?.data?.error || err.message });
            setStep("select");
        }
    };

    const handlePush = async () => {
        const filesToPush = convertedFiles
            .filter(f => f.status === "success" && f.converted_code)
            .map(f => ({ path: f.new_path, content: f.converted_code }));

        if (filesToPush.length === 0) {
            toast("No converted files to push");
            return;
        }

        setIsPushing(true);
        try {
            const res = await axios.post(`${BACKEND_URL}/github/push-branch`, {
                repo_name: repoName,
                branch_name: branchName,
                converted_files: filesToPush,
                commit_message: commitMessage,
            });

            if (res.data.success) {
                setPrUrl(res.data.pr_url || null);
                setStep("done");
                toast("Branch created successfully!", {
                    description: res.data.pr_url ? "Pull request created" : "Files pushed to branch",
                });
            } else {
                toast("Push failed", { description: res.data.error || "Unknown error" });
            }
        } catch (err: any) {
            toast("Push failed", { description: err.response?.data?.error || err.message });
        } finally {
            setIsPushing(false);
        }
    };

    const toggleFileSelection = (index: number) => {
        setScannedFiles(prev =>
            prev.map((f, i) => (i === index ? { ...f, selected: !f.selected } : f))
        );
    };

    const selectAll = () => setScannedFiles(prev => prev.map(f => ({ ...f, selected: true })));
    const deselectAll = () => setScannedFiles(prev => prev.map(f => ({ ...f, selected: false })));

    const selectedCount = scannedFiles.filter(f => f.selected).length;

    const resetWizard = () => {
        setStep("input");
        setRepoUrl("");
        setRepoName("");
        setRepoPath("");
        setScannedFiles([]);
        setConvertedFiles([]);
        setPrUrl(null);
        setShowGraph(false);
        setGraphData(null);
    };

    // Step indicator
    const steps = [
        { key: "input", label: "Repository" },
        { key: "select", label: "Select Files" },
        { key: "converting", label: "Convert" },
        { key: "push", label: "Push & PR" },
    ];

    const getStepIndex = (s: WizardStep) => {
        if (s === "input" || s === "scanning") return 0;
        if (s === "select") return 1;
        if (s === "converting") return 2;
        if (s === "push" || s === "done") return 3;
        return 0;
    };

    const currentStepIndex = getStepIndex(step);

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                            <GitBranch className="text-blue-600" size={28} />
                            Clone & Convert
                        </h2>
                        <p className="text-sm text-gray-600 mt-1">
                            Clone a repository, convert code, and push to a new branch with a PR
                        </p>
                    </div>
                    {step !== "input" && (
                        <button onClick={resetWizard} className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 flex items-center gap-2 text-sm">
                            <RotateCcw size={14} /> Start Over
                        </button>
                    )}
                </div>

                {/* Step Indicator */}
                <div className="flex items-center gap-2 mb-8">
                    {steps.map((s, i) => (
                        <React.Fragment key={s.key}>
                            <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${i < currentStepIndex ? "bg-green-100 text-green-700" :
                                i === currentStepIndex ? "bg-blue-600 text-white" :
                                    "bg-gray-200 text-gray-500"
                                }`}>
                                {i < currentStepIndex ? <CheckCircle size={14} /> : <span className="w-5 h-5 flex items-center justify-center rounded-full bg-current bg-opacity-20 text-xs">{i + 1}</span>}
                                {s.label}
                            </div>
                            {i < steps.length - 1 && <ChevronRight size={16} className="text-gray-400" />}
                        </React.Fragment>
                    ))}
                </div>

                {/* Step 1: Repository Input */}
                {(step === "input" || step === "scanning") && (
                    <div className="bg-white rounded-xl shadow-sm border p-8">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4">Enter Repository</h3>
                        <div className="flex gap-3">
                            <input
                                type="text"
                                value={repoUrl}
                                onChange={e => setRepoUrl(e.target.value)}
                                placeholder="owner/repo or https://github.com/owner/repo"
                                className="flex-1 px-4 py-3 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                onKeyDown={e => e.key === "Enter" && !isCloning && handleClone()}
                                disabled={isCloning}
                            />
                            <button
                                onClick={handleClone}
                                disabled={isCloning || !repoUrl.trim()}
                                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                            >
                                {isCloning ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                                {isCloning ? "Cloning..." : "Clone & Scan"}
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-3">
                            Supports public repos (or private if you've configured a GitHub token in Settings)
                        </p>

                        {/* Conversion Mode Selector */}
                        <div className="mt-6 flex items-center gap-3">
                            <label className="text-sm font-medium text-gray-700">Conversion Mode:</label>
                            <select
                                value={conversionMode}
                                onChange={e => setConversionMode(e.target.value as any)}
                                className="text-sm border border-gray-300 rounded-md px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="py2to3">Python 2 → Python 3</option>
                                <option value="java2py">Java → Python</option>
                                <option value="py2java">Python → Java</option>
                            </select>
                        </div>
                    </div>
                )}

                {/* Step 2: File Selection */}
                {step === "select" && (
                    <div className="bg-white rounded-xl shadow-sm border">
                        {/* Tabs: Files / Knowledge Graph */}
                        <div className="flex border-b">
                            <button
                                onClick={() => setShowGraph(false)}
                                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${!showGraph ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
                                    }`}
                            >
                                <FileText size={14} className="inline mr-2" />
                                Files ({scannedFiles.length})
                            </button>
                            <button
                                onClick={() => { if (!graphData) handleLoadGraph(); else setShowGraph(true); }}
                                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${showGraph ? "border-purple-600 text-purple-600" : "border-transparent text-gray-500 hover:text-gray-700"
                                    }`}
                            >
                                {isLoadingGraph ? <Loader2 size={14} className="animate-spin" /> : <Network size={14} />}
                                Knowledge Graph
                            </button>
                        </div>

                        {showGraph && graphData ? (
                            <KnowledgeGraph data={graphData} />
                        ) : !showGraph ? (
                            <div className="p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-800">
                                            {repoName}
                                        </h3>
                                        <p className="text-sm text-gray-500">
                                            {pythonCount} Python · {javaCount} Java · {selectedCount} selected
                                        </p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={selectAll} className="text-xs px-3 py-1 border rounded hover:bg-gray-50">Select All</button>
                                        <button onClick={deselectAll} className="text-xs px-3 py-1 border rounded hover:bg-gray-50">Deselect All</button>
                                    </div>
                                </div>

                                <div className="max-h-[400px] overflow-y-auto border rounded-lg">
                                    {scannedFiles.map((file, index) => (
                                        <div
                                            key={file.path}
                                            onClick={() => toggleFileSelection(index)}
                                            className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer border-b last:border-b-0 transition-colors ${file.selected ? "bg-blue-50 hover:bg-blue-100" : "hover:bg-gray-50"
                                                }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={file.selected}
                                                onChange={() => toggleFileSelection(index)}
                                                className="rounded text-blue-600"
                                            />
                                            <FileText size={14} className={file.language === "python" ? "text-blue-500" : "text-orange-500"} />
                                            <span className="text-sm font-mono flex-1">{file.path}</span>
                                            <span className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB</span>
                                            <span className={`text-xs px-2 py-0.5 rounded-full ${file.language === "python" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"
                                                }`}>
                                                {file.language}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-4 flex justify-end">
                                    <button
                                        onClick={handleBulkConvert}
                                        disabled={selectedCount === 0}
                                        className="bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                                    >
                                        <RotateCcw size={14} />
                                        Convert {selectedCount} File{selectedCount !== 1 ? "s" : ""}
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </div>
                )}

                {/* Step 3: Converting */}
                {step === "converting" && (
                    <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
                        <Loader2 size={48} className="animate-spin text-blue-600 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-gray-800">Converting Files...</h3>
                        <p className="text-sm text-gray-500 mt-2">
                            This may take a few minutes depending on the number of files.
                        </p>
                        <div className="mt-6 max-w-md mx-auto">
                            <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                    className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                                    style={{ width: `${convertTotal > 0 ? (convertProgress / convertTotal) * 100 : 0}%` }}
                                />
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                                {convertProgress} / {convertTotal} files
                            </p>
                        </div>
                    </div>
                )}

                {/* Step 4: Push & PR */}
                {step === "push" && (
                    <div className="bg-white rounded-xl shadow-sm border p-8">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4">Conversion Results</h3>

                        {/* Results summary */}
                        <div className="grid grid-cols-3 gap-4 mb-6">
                            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                                <div className="text-2xl font-bold text-green-700">
                                    {convertedFiles.filter(f => f.status === "success").length}
                                </div>
                                <div className="text-xs text-green-600">Converted</div>
                            </div>
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                                <div className="text-2xl font-bold text-red-700">
                                    {convertedFiles.filter(f => f.status === "error").length}
                                </div>
                                <div className="text-xs text-red-600">Failed</div>
                            </div>
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                                <div className="text-2xl font-bold text-gray-700">
                                    {convertedFiles.filter(f => f.status === "skipped").length}
                                </div>
                                <div className="text-xs text-gray-600">Skipped</div>
                            </div>
                        </div>

                        {/* Converted file list */}
                        <div className="max-h-[200px] overflow-y-auto border rounded-lg mb-6">
                            {convertedFiles.map((file, i) => (
                                <div key={i} className="flex items-center gap-3 px-4 py-2 border-b last:border-b-0 text-sm">
                                    {file.status === "success" ? (
                                        <CheckCircle size={14} className="text-green-500" />
                                    ) : file.status === "error" ? (
                                        <XCircle size={14} className="text-red-500" />
                                    ) : (
                                        <AlertCircle size={14} className="text-gray-400" />
                                    )}
                                    <span className="font-mono flex-1">{file.path}</span>
                                    {file.new_path && file.new_path !== file.path && (
                                        <>
                                            <ChevronRight size={12} className="text-gray-400" />
                                            <span className="font-mono text-green-600">{file.new_path}</span>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Push settings */}
                        <div className="border-t pt-6 space-y-4">
                            <h4 className="font-medium text-gray-700">Push to GitHub</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm text-gray-600 block mb-1">Branch Name</label>
                                    <input
                                        type="text"
                                        value={branchName}
                                        onChange={e => setBranchName(e.target.value)}
                                        className="w-full px-3 py-2 border rounded-lg text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm text-gray-600 block mb-1">Commit Message</label>
                                    <input
                                        type="text"
                                        value={commitMessage}
                                        onChange={e => setCommitMessage(e.target.value)}
                                        className="w-full px-3 py-2 border rounded-lg text-sm"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end">
                                <button
                                    onClick={handlePush}
                                    disabled={isPushing}
                                    className="bg-green-600 text-white px-6 py-2.5 rounded-lg hover:bg-green-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                                >
                                    {isPushing ? <Loader2 size={14} className="animate-spin" /> : <GitBranch size={14} />}
                                    {isPushing ? "Pushing..." : "Create Branch & PR"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 5: Done */}
                {step === "done" && (
                    <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                            <CheckCircle size={32} className="text-green-600" />
                        </div>
                        <h3 className="text-xl font-semibold text-gray-800">All Done!</h3>
                        <p className="text-sm text-gray-500 mt-2">
                            Branch <code className="bg-gray-100 px-2 py-0.5 rounded text-blue-600">{branchName}</code> has been created on <strong>{repoName}</strong>
                        </p>
                        {prUrl && (
                            <a
                                href={prUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 mt-4 bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 text-sm font-medium"
                            >
                                <ExternalLink size={14} />
                                View Pull Request
                            </a>
                        )}
                        <div className="mt-4">
                            <button onClick={resetWizard} className="text-sm text-gray-500 hover:text-gray-700 underline">
                                Start another conversion
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CloneConvert;
