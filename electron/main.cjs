const { app, BrowserWindow } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");

let mainWindow = null;
let serverProcess = null;
let backendProcess = null;

const SERVER_PORT = 8787;
const BACKEND_PORT = 8000;

function getBackendPath() {
  if (app.isPackaged) {
    return path.join(
      process.resourcesPath,
      "backend",
      "PrintBallBackend",
      "PrintBallBackend.exe"
    );
  }

  return path.join(
    __dirname,
    "..",
    "backend",
    "dist",
    "PrintBallBackend",
    "PrintBallBackend.exe"
  );
}

function getOutputDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "app", ".output")
    : path.join(__dirname, "..", ".output");
}

function getWranglerPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "app", "node_modules", "wrangler", "bin", "wrangler.js")
    : path.join(__dirname, "..", "node_modules", "wrangler", "bin", "wrangler.js");
}

function startBackend() {
  const backendPath = getBackendPath();

  console.log("Starting PrintBall backend:", backendPath);

  backendProcess = spawn(backendPath, [], {
    cwd: path.dirname(backendPath),
    windowsHide: true,
    shell: false,
  });

  backendProcess.stdout?.on("data", data => {
    console.log(`[Backend] ${data}`);
  });

  backendProcess.stderr?.on("data", data => {
    console.error(`[Backend] ${data}`);
  });

  backendProcess.on("error", error => {
    console.error("Backend failed:", error);
  });

  backendProcess.on("exit", code => {
    console.log(`Backend exited with code ${code}`);
    backendProcess = null;
  });
}

function startTanStackServer() {
  const outputDir = getOutputDir();
  const wranglerPath = getWranglerPath();

  console.log("Starting TanStack server");
  console.log("Output:", outputDir);
  console.log("Wrangler:", wranglerPath);

  serverProcess = spawn(
    process.execPath,
    [
      "--run-as-node",
      wranglerPath,
      "--cwd",
      outputDir,
      "dev",
      "--port",
      String(SERVER_PORT),
    ],
    {
      cwd: app.isPackaged
        ? path.join(process.resourcesPath, "app")
        : path.join(__dirname, ".."),
      windowsHide: true,
      shell: false,
    }
  );

  serverProcess.stdout?.on("data", data => {
    console.log(`[TanStack] ${data}`);
  });

  serverProcess.stderr?.on("data", data => {
    console.error(`[TanStack] ${data}`);
  });

  serverProcess.on("error", error => {
    console.error("TanStack server failed:", error);
  });

  serverProcess.on("exit", code => {
    console.log(`TanStack server exited with code ${code}`);
    serverProcess = null;
  });
}

function waitForServer(url, callback, attempts = 60) {
  const request = http.get(url, response => {
    response.resume();
    callback();
  });

  request.on("error", () => {
    if (attempts <= 0) {
      console.error("TanStack server did not become ready.");
      return;
    }

    setTimeout(
      () => waitForServer(url, callback, attempts - 1),
      500
    );
  });

  request.setTimeout(1000, () => {
    request.destroy();
  });
}

function createWindow() {
  if (mainWindow) return;

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: "PrintBall Attendance & Payroll",

    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${SERVER_PORT}`);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  startBackend();
  startTanStackServer();

  waitForServer(
    `http://127.0.0.1:${SERVER_PORT}`,
    createWindow
  );

  app.on("activate", () => {
    if (!mainWindow) {
      waitForServer(
        `http://127.0.0.1:${SERVER_PORT}`,
        createWindow
      );
    }
  });
});

function stopProcesses() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }

  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
}

app.on("window-all-closed", () => {
  stopProcesses();

  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  stopProcesses();
});
