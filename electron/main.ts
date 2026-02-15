import { spawn, ChildProcess } from "child_process";
import { app, BrowserWindow } from "electron";
import * as path from "path";

const isDev = process.env.NODE_ENV === "development";
let backendProc: ChildProcess;
function startBackend() {
  const backendDir = path.resolve(__dirname, "../backend");
  console.log(
    `[Electron Main]: Attempting to start backend from: ${backendDir}/api.py`
  );
  backendProc = spawn("python", ["api.py"], {
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
    console.error(
      `[Electron Main]: Failed to start backend process: ${err.message}`
    );
  });
}

function createWindow() {
  const win = new BrowserWindow({
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
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  console.log("[Electron Main]: Main Process Start!");
  startBackend();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("will-quit", () => {
  if (backendProc) {
    console.log("[Electron Main]: Killing backend process...");
    backendProc.kill("SIGINT");
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
