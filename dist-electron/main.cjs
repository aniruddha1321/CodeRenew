"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const electron_1 = require("electron");
const path = __importStar(require("path"));
const isDev = process.env.NODE_ENV === "development";
let backendProc;
function startBackend() {
    const backendDir = path.resolve(__dirname, "../backend");
    console.log(`[Electron Main]: Attempting to start backend from: ${backendDir}/api.py`);
    backendProc = (0, child_process_1.spawn)("python", ["api.py"], {
        cwd: backendDir,
        stdio: "pipe",
    });
    backendProc.stdout?.on("data", (data) => {
        console.log(`[Backend stdout]: ${data.toString().trim()}`);
    });
    backendProc.stderr?.on("data", (data) => {
        console.error(`[Backend stderr]: ${data.toString().trim()}`);
    });
    backendProc.on("close", (code, signal) => {
        console.log(`[Backend exited with code ${code}, signal ${signal}]`);
        if (code !== 0) {
            console.error("[Electron Main]: Backend process terminated abnormally!");
        }
    });
    backendProc.on("error", (err) => {
        console.error(`[Electron Main]: Failed to start backend process: ${err.message}`);
    });
}
function createWindow() {
    const win = new electron_1.BrowserWindow({
        width: 800,
        height: 600,
        icon: path.join(__dirname, '../public/lcm_iconlinux.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });
    if (isDev) {
        win.loadURL("http://localhost:8080");
        win.webContents.openDevTools();
    }
    else {
        win.loadFile(path.join(__dirname, "../dist/index.html"));
    }
}
electron_1.app.whenReady().then(() => {
    console.log("[Electron Main]: Main Process Start!");
    startBackend();
    createWindow();
    electron_1.app.on("activate", () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
electron_1.app.on("will-quit", () => {
    if (backendProc) {
        console.log("[Electron Main]: Killing backend process...");
        backendProc.kill("SIGINT");
    }
});
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin")
        electron_1.app.quit();
});
