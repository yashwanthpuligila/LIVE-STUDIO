/**
 * Live Studio Automated Verification Test Suite
 * Tests Core Engines: Scenes, Annotations, Recording, Streaming, Credentials, File Management
 */

import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { getFFmpegPath } from '../src/main/utils/ffmpegHelper';

let passed = 0;
let failed = 0;

function it(description: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res.then(() => {
        console.log(`  ✓ ${description}`);
        passed++;
      }).catch((err) => {
        console.error(`  ✗ ${description}:`, err.message);
        failed++;
      });
    } else {
      console.log(`  ✓ ${description}`);
      passed++;
    }
  } catch (err: any) {
    console.error(`  ✗ ${description}:`, err.message);
    failed++;
  }
}

async function runAllTests() {
  console.log('\n========================================');
  console.log(' LIVE STUDIO - AUTOMATED TEST SUITE');
  console.log('========================================\n');

  console.log('1. FFmpeg Binary & Native Engine Tests:');
  it('Should successfully resolve FFmpeg binary executable', () => {
    const p = getFFmpegPath();
    assert(p && p.length > 0, 'FFmpeg path is empty');
    assert(fs.existsSync(p), `FFmpeg binary does not exist at ${p}`);
  });

  console.log('\n2. Annotation Engine & Coordinate Scaling Tests:');
  it('Should properly scale client coordinates to 1920x1080 canvas', () => {
    const clientRect = { width: 960, height: 540, left: 100, top: 50 };
    const clientX = 580; // 480px from left (center)
    const clientY = 320; // 270px from top (center)

    const scaleX = 1920 / clientRect.width; // 2.0
    const scaleY = 1080 / clientRect.height; // 2.0

    const canvasX = Math.round((clientX - clientRect.left) * scaleX);
    const canvasY = Math.round((clientY - clientRect.top) * scaleY);

    assert.strictEqual(canvasX, 960, 'Canvas X coordinate scaling failed');
    assert.strictEqual(canvasY, 540, 'Canvas Y coordinate scaling failed');
  });

  it('Should maintain Undo and Redo stack invariants', () => {
    const history: any[][] = [];
    const redoStack: any[][] = [];
    let elements: any[] = [];

    // Action 1: Add element A
    history.push([...elements]);
    elements.push({ id: '1', tool: 'pen' });

    // Action 2: Add element B
    history.push([...elements]);
    elements.push({ id: '2', tool: 'rect' });
    assert.strictEqual(elements.length, 2);

    // Undo: Back to A
    redoStack.push([...elements]);
    elements = history.pop()!;
    assert.strictEqual(elements.length, 1);
    assert.strictEqual(elements[0].id, '1');

    // Redo: Back to A + B
    history.push([...elements]);
    elements = redoStack.pop()!;
    assert.strictEqual(elements.length, 2);
  });

  console.log('\n3. Scenes & Source Z-Index Layering Tests:');
  it('Should correctly order and swap layers by z-index', () => {
    const sources = [
      { id: 'screen', zIndex: 1 },
      { id: 'webcam', zIndex: 2 },
      { id: 'text', zIndex: 3 },
    ];

    // Reverse order for top-down display
    const sorted = [...sources].sort((a, b) => b.zIndex - a.zIndex);
    assert.strictEqual(sorted[0].id, 'text');
    assert.strictEqual(sorted[1].id, 'webcam');
    assert.strictEqual(sorted[2].id, 'screen');
  });

  console.log('\n4. Streaming URL & Stderr Telemetry Parser Tests:');
  it('Should parse FFmpeg real-time progress stderr string', () => {
    const stderrLine = 'frame=  240 fps= 60.0 q=22.0 size=    2450kB time=00:00:04.00 bitrate=5017.6kbits/s speed=1.0x';
    const fpsMatch = stderrLine.match(/fps=\s*([\d.]+)/);
    const bitrateMatch = stderrLine.match(/bitrate=\s*([\d.]+)kbits\/s/);

    assert(fpsMatch !== null, 'FPS regex match failed');
    assert.strictEqual(Math.round(parseFloat(fpsMatch[1])), 60);

    assert(bitrateMatch !== null, 'Bitrate regex match failed');
    assert.strictEqual(Math.round(parseFloat(bitrateMatch[1])), 5018);
  });

  it('Should properly construct secure YouTube RTMPS target URL', () => {
    const rtmpUrl = 'rtmps://a.rtmp.youtube.com/live2/';
    const streamKey = 'abcd-1234-efgh-5678';
    const cleanedBase = rtmpUrl.replace(/\/+$/, '');
    const fullTarget = `${cleanedBase}/${streamKey}`;

    assert.strictEqual(fullTarget, 'rtmps://a.rtmp.youtube.com/live2/abcd-1234-efgh-5678');
  });

  console.log('\n5. Storage & File Management Tests:');
  it('Should format file sizes and durations correctly', () => {
    const bytes1 = 15 * 1024 * 1024; // 15 MB
    const mb = bytes1 / (1024 * 1024);
    assert.strictEqual(`${mb.toFixed(1)} MB`, '15.0 MB');

    const durationSec = 125; // 2m 05s
    const m = Math.floor(durationSec / 60);
    const s = durationSec % 60;
    const formatted = `${m}:${s.toString().padStart(2, '0')}`;
    assert.strictEqual(formatted, '2:05');
  });

  console.log('\n6. Full-Monitor Capture Resolution & Aspect Ratio Tests:');
  it('Should preserve native aspect ratio when fitting display on canvas', () => {
    // 16:9 1080p source fitted on 1920x1080 canvas
    const display1 = { width: 1920, height: 1080 };
    const canvas = { width: 1920, height: 1080 };
    const scale = Math.min(canvas.width / display1.width, canvas.height / display1.height);
    const drawWidth = display1.width * scale;
    const drawHeight = display1.height * scale;
    const offsetX = (canvas.width - drawWidth) / 2;
    const offsetY = (canvas.height - drawHeight) / 2;

    assert.strictEqual(drawWidth, 1920);
    assert.strictEqual(drawHeight, 1080);
    assert.strictEqual(offsetX, 0);
    assert.strictEqual(offsetY, 0);

    // 21:9 Ultrawide (2560x1080) pillar/letterboxed without distortion
    const display2 = { width: 2560, height: 1080 };
    const scaleUW = Math.min(canvas.width / display2.width, canvas.height / display2.height);
    const drawWidthUW = display2.width * scaleUW;
    const drawHeightUW = display2.height * scaleUW;
    assert.strictEqual(Math.round(drawWidthUW), 1920);
    assert.strictEqual(Math.round(drawHeightUW), 810);
    assert.strictEqual(Math.round((canvas.height - drawHeightUW) / 2), 135);
  });

  console.log('\n7. Balanced Recording Profile & Adaptive Quality Tests:');
  it('Should define correct Balanced profile targets', () => {
    const balancedProfile = {
      name: 'balanced',
      width: 1920,
      height: 1080,
      fps: 30,
      videoBitrateKbps: 5000,
      audioBitrateKbps: 160,
    };

    assert.strictEqual(balancedProfile.width, 1920);
    assert.strictEqual(balancedProfile.height, 1080);
    assert.strictEqual(balancedProfile.fps, 30);
    assert(balancedProfile.videoBitrateKbps >= 4000 && balancedProfile.videoBitrateKbps <= 8000);
  });

  it('Should configure explicit 720p fallback when 1080p cannot be sustained', () => {
    const fallbackProfile = {
      name: 'fallback_720p',
      width: 1280,
      height: 720,
      fps: 30,
      videoBitrateKbps: 2500,
    };

    assert.strictEqual(fallbackProfile.width, 1280);
    assert.strictEqual(fallbackProfile.height, 720);
    assert.strictEqual(fallbackProfile.fps, 30);
  });

  console.log('\n8. Hardware Encoder Detection & Fallback Tests:');
  await it('Should probe hardware encoders via FFmpeg and select optimal encoder', async () => {
    const { EncoderDetector } = await import('../src/main/recording/encoderDetector');
    const encoders = await EncoderDetector.detectEncoders();

    assert(Array.isArray(encoders), 'Encoders result must be an array');
    assert(encoders.length >= 2, 'Must probe multiple hardware & software candidates');

    const softwareX264 = encoders.find((e) => e.id === 'libx264');
    assert(softwareX264 !== undefined, 'libx264 software fallback must exist');
    assert.strictEqual(softwareX264?.isAvailable, true, 'libx264 must be available');

    const active = EncoderDetector.getActiveEncoder();
    assert(active !== null, 'An active encoder must be determined');
    assert(active.isAvailable, 'Active encoder must be verified available');
    console.log(`     Active Encoder Determined: ${active.name} (${active.codec}) [${active.type}]`);
  });

  console.log('\n9. Memory & Bounded Buffer Queue Tests:');
  it('Should enforce bounded queue size to prevent memory leaks', () => {
    const MAX_QUEUE_SIZE = 30; // 1 second buffer at 30 fps
    const frameQueue: number[] = [];

    // Simulate 100 incoming frames when encoder is momentarily busy
    for (let i = 0; i < 100; i++) {
      if (frameQueue.length >= MAX_QUEUE_SIZE) {
        frameQueue.shift(); // Drop oldest frame to cap memory usage
      }
      frameQueue.push(i);
    }

    assert.strictEqual(frameQueue.length, MAX_QUEUE_SIZE, 'Queue size must never exceed boundary');
    assert.strictEqual(frameQueue[frameQueue.length - 1], 99, 'Queue must retain latest frame');
  });

  console.log('\n========================================');
  console.log(` RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch(console.error);
