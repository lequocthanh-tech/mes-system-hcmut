/* Hallmark · component: SingleInstanceLockAndStartupConcurrencyShield · genre: modern-minimal · register: industrial-workbench
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: WCAG AA Pass
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { spawn, execSync } = require('node:child_process');

// ============================================================================
// PART 1: ELECTRON SINGLE-INSTANCE MUTEX LOCK
// ============================================================================
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Redundant instance detected: immediately quit without affecting running services
  app.quit();
  process.exit(100);
}

// Bind second-instance listener to restore and focus the primary session window
app.on('second-instance', (event, commandLine, workingDirectory) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  } else if (splashWindow && !splashWindow.isDestroyed()) {
    if (splashWindow.isMinimized()) splashWindow.restore();
    splashWindow.focus();
  }
});

if (process.platform === 'win32') {
  app.setAppUserModelId('vn.hcmut.dairymes.workbench');
}

const isDev = !app.isPackaged;
let isPrimaryInstance = true;

let pythonProcess = null;
let pythonGatewayPid = null;
let isShuttingDown = false;

let splashWindow = null;
let mainWindow = null;

/**
 * Force kill a process and its entire process tree on Windows
 */
function forceKillPid(pid) {
  if (!pid || pid === 0 || pid === process.pid) return;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
    } else {
      process.kill(-pid, 'SIGKILL');
    }
  } catch (_) {
    // Process might already be terminated
  }
}

/**
 * Scans a port and forcefully terminates any process holding it
 */
function killProcessOnPort(port) {
  try {
    const netstatOut = execSync(`netstat -ano | findstr :${port}`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const lines = netstatOut.trim().split(/\r?\n/);
    for (const line of lines) {
      if (line.includes('LISTENING')) {
        const parts = line.trim().split(/\s+/);
        const pidStr = parts[parts.length - 1];
        const pidNum = parseInt(pidStr, 10);
        if (pidNum && pidNum > 0 && pidNum !== process.pid) {
          forceKillPid(pidNum);
        }
      }
    }
  } catch (_) {}
}

/**
 * Clean up all child processes, Python Gateway, and background services
 */
function stopBackendService() {
  if (!isPrimaryInstance) return;
  if (isShuttingDown) return;
  isShuttingDown = true;
  if (isDev && process.env.MES_DEBUG === 'true') {
    console.log('[Lifecycle] Initiating shutdown: Terminating Python Gateway and background processes...');
  }

  if (pythonProcess) {
    try {
      pythonProcess.kill('SIGTERM');
    } catch (_) {}
  }

  if (pythonGatewayPid) {
    if (isDev && process.env.MES_DEBUG === 'true') {
      console.log(`[Lifecycle] Force killing Python Gateway PID: ${pythonGatewayPid}`);
    }
    forceKillPid(pythonGatewayPid);
    pythonGatewayPid = null;
  }

  if (pythonProcess && pythonProcess.pid) {
    forceKillPid(pythonProcess.pid);
    pythonProcess = null;
  }

  killProcessOnPort(8000);

  if (isDev) {
    killProcessOnPort(5173);
  }

  if (isDev && process.env.MES_DEBUG === 'true') {
    console.log('[Lifecycle] Clean process lifecycle complete. Zero background footprint.');
  }
}

/**
 * Resolves a reliable Python runtime environment on Windows
 * checking for pyodbc and fastapi availability
 */
function resolvePythonCommand(scriptPath) {
  if (process.platform !== 'win32') {
    return { cmd: 'python3', args: [scriptPath] };
  }

  const localAppData = process.env.LOCALAPPDATA || '';
  const py312Exe = path.join(localAppData, 'Programs', 'Python', 'Python312', 'python.exe');

  const candidates = [
    { cmd: 'py', args: ['-3.12', scriptPath], testArgs: ['-3.12', '-c', 'import pyodbc, fastapi'] },
    { cmd: py312Exe, args: [scriptPath], testArgs: ['-c', 'import pyodbc, fastapi'] },
    { cmd: 'py', args: [scriptPath], testArgs: ['-c', 'import pyodbc, fastapi'] },
    { cmd: 'python', args: [scriptPath], testArgs: ['-c', 'import pyodbc, fastapi'] },
  ];

  for (const cand of candidates) {
    try {
      if (cand.cmd.includes(path.sep) && !require('fs').existsSync(cand.cmd)) {
        continue;
      }
      execSync(`"${cand.cmd}" ${cand.testArgs.join(' ')}`, { stdio: 'ignore', timeout: 2500 });
      return { cmd: cand.cmd, args: cand.args };
    } catch (_) {}
  }

  return { cmd: 'python', args: [scriptPath] };
}

/**
 * Automated Process Manager:
 * Spawns and supervises backend/kepware_gateway.py in background as managed hidden child process
 */
function startBackendService() {
  // If Python Gateway is already active (e.g., launched asynchronously by Run_App.bat), attach cleanly
  try {
    const netstatOut = execSync('netstat -ano | findstr :8000', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const lines = netstatOut.trim().split(/\r?\n/);
    for (const line of lines) {
      if (line.includes('LISTENING')) {
        const parts = line.trim().split(/\s+/);
        const pidNum = parseInt(parts[parts.length - 1], 10);
        if (pidNum && pidNum > 0 && pidNum !== process.pid) {
          pythonGatewayPid = pidNum;
          if (isDev && process.env.MES_DEBUG === 'true') {
            console.log(`[Lifecycle] Attached to active Python Gateway PID: ${pythonGatewayPid}`);
          }
          return;
        }
      }
    }
  } catch (_) {}

  killProcessOnPort(8000);

  const scriptPath = path.join(__dirname, '..', 'backend', 'kepware_gateway.py');
  const py = resolvePythonCommand(scriptPath);

  if (isDev && process.env.MES_DEBUG === 'true') {
    console.log(`[Lifecycle] Spawning Python Gateway: ${py.cmd} ${py.args.join(' ')}`);
  }

  pythonProcess = spawn(py.cmd, py.args, {
    cwd: path.join(__dirname, '..'),
    stdio: 'pipe',
    shell: false,
    windowsHide: true,
  });

  if (pythonProcess && pythonProcess.pid) {
    pythonGatewayPid = pythonProcess.pid;
  }

  // Drain stdout/stderr streams to prevent OS buffer blocking while keeping terminal output completely silent
  const debugEnabled = isDev && process.env.MES_DEBUG === 'true';
  pythonProcess.stdout.on('data', (data) => {
    if (debugEnabled) console.log(`[Python Gateway]: ${data.toString().trim()}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    if (debugEnabled) console.error(`[Python Gateway Error]: ${data.toString().trim()}`);
  });

  pythonProcess.on('close', (code) => {
    if (debugEnabled) console.log(`[Python Gateway] Process exited with code ${code}`);
  });

  pythonProcess.on('error', (err) => {
    if (debugEnabled) console.error(`[Python Gateway] Failed to start process:`, err);
  });
}

/**
 * Creates and displays the frameless Splash Screen window immediately
 * Delivers instant visual feedback to operators during system boot
 */
function createSplashWindow() {
  const appIconPath = path.join(__dirname, '../public/assets/app_icon.ico');

  // Splash Screen Window (Frameless, transparent, always on top, centered)
  splashWindow = new BrowserWindow({
    width: 520,
    height: 320,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    center: true,
    hasShadow: true,
    show: true,
    icon: appIconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.show();
}

/**
 * Initializes Main Window with seamless zero-flash handshake
 */
function createMainWindow() {
  const appIconPath = path.join(__dirname, '../public/assets/app_icon.ico');

  // Primary Desktop Application Window (Hidden initially with dark background to prevent white flash)
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    backgroundColor: '#030712',
    autoHideMenuBar: false,
    title: 'DAIRY MES WORKBENCH',
    icon: appIconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Seamless Splash-to-Login Handshake Architecture
  let isAppReady = false;
  let isSplashDone = false;
  let isHandoffCompleted = false;

  function attemptHandoff() {
    if (isHandoffCompleted) return;
    if (isAppReady && isSplashDone) {
      isHandoffCompleted = true;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.setZoomFactor(1.18);
        mainWindow.show();
        mainWindow.maximize();
        mainWindow.focus();
      }

      if (splashWindow && !splashWindow.isDestroyed()) {
        try {
          splashWindow.close();
        } catch (_) {
          splashWindow.destroy();
        }
        splashWindow = null;
      }
    }
  }

  ipcMain.once('app-mounted', () => {
    if (isDev && process.env.MES_DEBUG === 'true') {
      console.log('[Lifecycle] Handshake signal received: app-mounted (React root mounted & painted).');
    }
    isAppReady = true;
    attemptHandoff();
  });

  ipcMain.once('splash-animation-complete', () => {
    if (isDev && process.env.MES_DEBUG === 'true') {
      console.log('[Lifecycle] Handshake signal received: splash-animation-complete (100% progress).');
    }
    isSplashDone = true;
    attemptHandoff();
  });

  // Maintain safety fallback: if app-mounted or splash completion takes longer than 6 seconds, force attemptHandoff()
  setTimeout(() => {
    if (!isHandoffCompleted) {
      if (isDev && process.env.MES_DEBUG === 'true') {
        console.warn('[Lifecycle] Handshake safety fallback triggered (timeout >= 6000ms). Forcing main window presentation.');
      }
      isAppReady = true;
      isSplashDone = true;
      attemptHandoff();
    }
  }, 6000);

  // Load URL in Dev mode or static build files in Production
  if (isDev) {
    const devUrl = 'http://localhost:5173';
    const loadDevServer = () => {
      mainWindow.loadURL(devUrl).catch((err) => {
        if (isDev && process.env.MES_DEBUG === 'true') {
          console.log('Vite server not ready yet, retrying in 200ms...', err.message);
        }
        setTimeout(loadDevServer, 200);
      });
    };
    loadDevServer();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // 1. Splash Window displayed first for immediate visual feedback
  createSplashWindow();

  // 2. Start Python backend gateway (OPC UA & Historian)
  startBackendService();

  // 3. Initialize Main Window with seamless zero-flash handshake
  createMainWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createSplashWindow();
      createMainWindow();
    }
  });
});

// Force clean teardown on all exit and closure vectors
app.on('before-quit', () => {
  stopBackendService();
});

app.on('will-quit', () => {
  stopBackendService();
});

app.on('window-all-closed', function () {
  stopBackendService();
  if (process.platform !== 'darwin') app.quit();
});

process.on('exit', () => {
  stopBackendService();
});

process.on('SIGINT', () => {
  stopBackendService();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopBackendService();
  process.exit(0);
});
