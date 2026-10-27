# Live Studio — Professional Screen Recording & YouTube Streaming Desktop Application

**Live Studio** is a production-oriented Windows desktop application that combines the capabilities of OBS Studio, an interactive screen annotation and presentation tool, and a tutorial recording studio with YouTube Live streaming integration.

---

## 1. System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        RENDERER PROCESS (React 19)                    │
│                                                                        │
│  ┌───────────────────────┐          ┌───────────────────────────────┐  │
│  │   Studio Workspace    │          │    Vector Annotation Engine   │  │
│  │  - Scene Manager      │          │  - Pen, Highlighter, Arrow   │  │
│  │  - Source Inspector   │          │  - Rect, Circle, Text, Laser  │  │
│  │  - Multi-track Mixer  │          │  - Coordinate Scaling (1080p) │  │
│  └──────────┬────────────┘          └───────────────┬───────────────┘  │
│             │                                       │                  │
│             ▼                                       ▼                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │               60 FPS Master Canvas Composition Loop              │  │
│  │     (Displays + Windows + Webcam PiP + Direct Annotation Blit)   │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
│                                     │ canvas.captureStream(60)         │
│                                     ▼                                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                   Web Audio API Graph & VU Meters                │  │
│  │     (Microphone + Desktop Audio -> Gain -> Analyser -> Mixed)    │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
│                                     │ Combined MediaStream             │
│                 ┌───────────────────┴───────────────────┐              │
│                 ▼                                       ▼              │
│   Local Recording MediaRecorder           YouTube Live MediaRecorder   │
│   (1000ms WebM chunks -> IPC)             (500ms low-latency -> IPC)   │
└─────────────────┬───────────────────────────────────────┬──────────────┘
                  │ IPC (Typed Preload Bridge)            │ IPC
                  ▼                                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      ELECTRON MAIN PROCESS (Node.js)                   │
│                                                                        │
│  ┌───────────────────────────┐            ┌─────────────────────────┐  │
│  │   FFmpeg Remuxing Engine  │            │   FFmpeg RTMPS Engine   │  │
│  │  - Native FFmpeg 6.1      │            │  - Pipe:0 Stdin Ingest  │  │
│  │  - Faststart MOOV atom    │            │  - Real-time Telemetry  │  │
│  │  - 0.5s Thumbnail Extract │            │  - Low Latency FLV Push │  │
│  └──────────────┬────────────┘            └────────────┬────────────┘  │
│                 │                                      │               │
│                 ▼                                      ▼               │
│         Local MP4 Library                     YouTube Live Ingest      │
│     (Videos/LiveStudio/*.mp4)            (rtmps://a.rtmp.youtube.com)  │
│                                                                        │
│  ┌───────────────────────────┐            ┌─────────────────────────┐  │
│  │   Persistent Stores       │            │  Windows DPAPI Security │  │
│  │  - Recordings Registry    │            │  - safeStorage Encrypt  │  │
│  │  - Scene Presets & Layout │            │  - Stream Key Masking   │  │
│  └───────────────────────────┘            └─────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Key Features

### 🖥️ Display & Window Capture
- Enumerate all physical monitors and open application windows via Electron `desktopCapturer`.
- Live high-resolution thumbnails in the Source Picker modal.
- Dynamic monitor resolution changes and window geometry handling.

### ✏️ Annotation & Drawing Suite
- **Complete Vector Tools**: Freehand pen, semi-transparent highlighter, straight line, directional vector arrow, rectangle, circle/ellipse, clickable text notes, glowing laser pointer with fading trail.
- **Zero-Loss Compositing**: Annotations are rendered into the canvas frame-by-frame, ensuring that drawings are composited directly into the recorded MP4 output and outgoing YouTube Live stream.
- **Aspect-Ratio & Scaling Independence**: Normalizes mouse/touch coordinates from display window resolution to the master 1920x1080 canvas coordinates.
- **History**: Full multi-step Undo (`Ctrl+Z`), Redo (`Ctrl+Y`), and Clear All.

### 🎙️ Audio Mixer & Real-Time VU Meters
- Multi-track mixing: Microphone input, Desktop/System audio, and Webcam audio.
- Web Audio API pipeline with independent volume faders (0% to 150%) and mute toggles.
- Real-time stereo VU peak level and RMS metering (-60 dB to 0 dB) with warning and clipping indicators.
- Acoustic Echo Cancellation and AI Noise Suppression.

### 🎬 Scene & Source Management
- Multi-scene switcher: Tutorial Fullscreen, Screen + Webcam PiP, Webcam Presentation, Slides.
- Add, duplicate, rename, and delete scenes without interrupting streams.
- Full layer controls: Z-index reordering, visibility toggle (`Eye`), position lock (`Lock`), corner border-radius slider (for circular camera overlays), opacity slider.

### 💾 Local MP4 Recording Engine
- Start, pause, resume, and stop controls with elapsed recording timer.
- FFmpeg remuxing and transcoding pipeline producing standard H.264/AAC MP4 files with `faststart` MOOV atom (enables instant scrubbing and universal playback).
- Automatic high-resolution thumbnail extraction.
- Automatic timestamped filenames: `LiveStudio_YYYY-MM-DD_HH-mm-ss.mp4`.

### 📡 YouTube Live Streaming Engine
- **Mode B (Independent Native Engine)**: Direct FFmpeg RTMPS broadcast (`rtmps://a.rtmp.youtube.com/live2`).
- Real-time stderr telemetry monitoring: active FPS, streaming bitrate (kbps), uptime timer, and dropped frames.
- Windows DPAPI credential encryption via Electron `safeStorage`.
- **Mode A (OBS Studio Integration)**: WebSocket v5 client for connecting and driving an external OBS Studio instance.

### 📂 Recordings Library & Settings
- In-app video playback modal.
- Search recordings by title and filename.
- File actions: Reveal in Windows Explorer, rename title, delete with confirmation.
- Preferences: Resolution presets (1080p, 720p, 4K), framerate (30/60 fps), target bitrate, directory picker, global keyboard shortcuts.

---

## 3. Getting Started

### Prerequisites
- Windows 10 / 11 (64-bit)
- Node.js 18+ (tested on Node v22.17.0 and npm 10.9.2)

### Installation
```bash
# Clone and enter directory
cd d:/LIVE_STREAM

# Dependencies are already installed in this repository
npm install
```

### Development Mode
```bash
# Build main process, preload script, and start Electron + Vite dev server
npm run start
```

### Running Automated Test Suite
```bash
npm test
```
*Outputs: 7 passing tests covering FFmpeg resolution, coordinate scaling, undo/redo stacks, layer ordering, and telemetry parsing.*

### Building Production Windows Installer (.exe)
```bash
# Package standalone Windows executable into release/win-unpacked
npm run dist
```
The resulting executable is generated at:
`release/win-unpacked/Live Studio.exe`

---

## 4. Manual Testing Instructions

Follow this checklist to verify the full studio workflow:

| Step | Feature | Action | Expected Result |
|---|---|---|---|
| 1 | **Display Selection** | In Studio, click **Select Display** in the top bar. | Source picker opens showing thumbnails of screens and windows. Selecting a screen updates the central preview. |
| 2 | **Webcam Overlay** | In Sources panel, click `+` -> **Webcam Camera**. | Webcam PiP appears on the canvas. Adjust position and corner radius in the Properties panel. |
| 3 | **Annotation Compositing** | Click **Draw Mode** on the toolbar. Select **Pen** or **Arrow** and draw across the screen. | Drawings appear over the preview. Try **Undo** (`Ctrl+Z`) and **Clear All**. |
| 4 | **Audio Metering** | Speak into your microphone. | The green/yellow VU meter in the Audio Mixer bounces dynamically in response to your voice. |
| 5 | **Local Recording** | Click the big red **Start Recording** button. Draw annotations and speak for 10 seconds, then click **Stop**. | Status changes to "Finalizing MP4...". The video is saved to `Videos/LiveStudio/` with a generated thumbnail. |
| 6 | **Playback Verification** | Click **Library** in the top header. | The new recording appears in the library. Click it to open the in-app player and verify that annotations and microphone audio are composited into the video. |
| 7 | **Reveal in Explorer** | Click the folder icon on any recording card. | Windows Explorer opens and highlights the exact MP4 file on disk. |
| 8 | **YouTube Live Broadcast** | Click **YouTube Live Stream**. Enter your YouTube stream key and click **Go Live on YouTube**. | FFmpeg connects to the YouTube Live ingest server. Status updates to LIVE with real-time FPS and bitrate telemetry. |

---

## 5. Security & IPC Integrity

- **Context Isolation**: `contextIsolation: true` and `nodeIntegration: false` enforced across all browser windows.
- **Secure Preload Bridge**: Renderer interacts only via strictly validated `window.electronAPI` channels.
- **Credential Storage**: YouTube stream keys are encrypted using Windows DPAPI via Electron's `safeStorage.encryptString()`. Keys are never written to unencrypted configuration files or console logs.

---

## 6. Project Structure

```
d:/LIVE_STREAM/
├── src/
│   ├── main/
│   │   ├── capture/screenCapture.ts        # Desktop capturer source enumeration
│   │   ├── recording/recordingManager.ts    # WebM to MP4 remuxer & thumbnail extractor
│   │   ├── streaming/streamingManager.ts    # Native FFmpeg RTMPS streamer & OBS WebSocket
│   │   ├── storage/configStore.ts          # DPAPI settings store
│   │   ├── storage/recordingsStore.ts      # Video registry & filesystem sync
│   │   ├── storage/scenesStore.ts          # Scene layout configurations
│   │   ├── utils/ffmpegHelper.ts           # Cross-environment FFmpeg binary resolver
│   │   ├── ipc/index.ts                    # Main IPC handlers
│   │   └── index.ts                        # Electron application lifecycle
│   ├── preload/
│   │   └── index.ts                        # Typed contextBridge electronAPI
│   ├── renderer/
│   │   ├── annotations/                    # Vector drawing & laser pointer engine
│   │   ├── studio/                         # Master Composition Canvas & Audio Mixer
│   │   ├── scenes/                         # Scene and Source manager panels
│   │   ├── pages/                          # Dashboard, Studio, Library, Settings
│   │   ├── App.tsx                         # View router
│   │   └── main.tsx                        # React 19 entry point
│   └── shared/types/index.ts               # Shared TypeScript schemas
├── tests/runTests.ts                       # Automated engine test suite
├── package.json                            # Scripts and electron-builder config
├── vite.config.ts                          # Vite and Tailwind config
└── README.md                               # System documentation
```
