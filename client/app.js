import {
  AudioClassifier,
  FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@0.10.0";

console.log("🟢 Silent Sentinel Script Loaded v2.1");
let lastImpulseTime = 0;

const IMPULSIVE_SOUNDS = [
  "gunshot",
  "shot",
  "glass",
  "shatter",
  "break",
  "explosion",
  "firecracker",
  "balloon pop"
];


// --- UI Elements ---
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const statusText = document.getElementById("status");
const soundLabel = document.getElementById("soundLabel");
const confidenceText = document.getElementById("confidence");
const audioLevelBar = document.getElementById("audioLevelBar");
const rmsValue = document.getElementById("rmsValue");
const detectionLog = document.getElementById("detectionLog");
const alertBox = document.getElementById("alertBox");
const claudeVerdict = document.getElementById("claudeVerdict");
const claudeReason = document.getElementById("claudeReason");
const claudeCard = document.getElementById("claudeCard");

// --- State Variables ---

// --- State Variables ---
let audioBuffer = [];
let isClassifying = false;
let analyser = null;
let animationFrameId = null;
let classifier = null;
let audioContext = null;
let stream = null;
let processor = null;
let history = [];

// Sustained detection & Cooldown tracking
let soundTracker = {
  label: null,
  isCritical: false,
  count: 0,
  startTime: 0
};
let lastTriggerTime = 0;
const TRIGGER_COOLDOWN = 10000; // 10 seconds
const SUSTAINED_THRESHOLD = 3; // Approx 1.5 - 2 seconds of consistent detection


const CRITICAL_SOUNDS = [
  'glass', 'break', 'shatter', 'smash', 'crash', 'crunch',
  'fire alarm', 'smoke detector', 'siren', 'emergency',
  'explosion', 'scream', 'shout', 'yell',
  'car horn', 'doorbell', 'door knock', 'knock',
  'alarm', 'bell', 'telephone', 'gunshot', 'shot',
  'fire', 'crackle', 'sizzle'
];

// --- Helper Functions ---
function isCriticalSound(label) {
  const lower = label.toLowerCase();
  return CRITICAL_SOUNDS.some(critical => lower.includes(critical));
}
function isImpulsiveSound(label) {
  const l = label.toLowerCase();
  return IMPULSIVE_SOUNDS.some(s => l.includes(s));
}


async function sendToServer(soundData) {
  try {
    const claudeVerdict = document.getElementById("claudeVerdict");
    const claudeReason = document.getElementById("claudeReason");
    const claudeRecommendation = document.getElementById("claudeRecommendation");
    const alertBox = document.getElementById("alertBox");

    claudeVerdict.innerText = "🔍 Analyzing risk...";
    claudeVerdict.className = "analyzing";
    claudeReason.innerText = "";
    if (claudeRecommendation) claudeRecommendation.innerText = "";

    const response = await fetch("/verify-sound", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(soundData)
    });

    if (!response.ok) throw new Error("Server error");

    const result = await response.json();

    // Handle new JSON format from Server
    // { "emergency": boolean, "reason": "...", "recommendation": "..." }

    if (result.emergency) {
      claudeVerdict.innerText = "🚨 EMERGENCY";
      claudeVerdict.className = "verdict-emergency";
    } else {
      claudeVerdict.innerText = "✅ Monitor"; // Safe / Warning
      claudeVerdict.className = "verdict-safe";
    }

    claudeReason.innerText = result.reason || "No reason provided";
    if (claudeRecommendation) {
      claudeRecommendation.innerText = result.recommendation || "";
    }

    if (result.emergency) {
      alertBox.classList.remove('hidden');
      alertBox.innerHTML = `
        <strong>🚨 EMERGENCY ALERT</strong><br>
        ${result.reason.toUpperCase()}<br>
        <div style="font-size: 0.8em; margin-top: 5px;">${result.recommendation}</div>
      `;

      // Accessibility: Vibrate the device (SOS pattern)
      if ("vibrate" in navigator) {
        navigator.vibrate([500, 200, 500, 200, 500]);
      }
    } else {
      // If it was a false alarm from client side logic but Claude says it's fine, hide alert
      alertBox.classList.add('hidden');
    }

  } catch (err) {
    console.error("Server call failed:", err);
    const claudeVerdict = document.getElementById("claudeVerdict");
    claudeVerdict.innerText = "Error contacting AI";
  }
}

function addToLog(label, score, critical = false) {
  const time = new Date().toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = `log-entry ${critical ? 'critical' : ''}`;
  entry.innerHTML = `
    <span class="log-time">${time}</span>
    <span class="log-label">${label}</span>
    <span class="log-score">${(score * 100).toFixed(1)}%</span>
  `;
  detectionLog.insertBefore(entry, detectionLog.firstChild);

  while (detectionLog.children.length > 15) {
    detectionLog.removeChild(detectionLog.lastChild);
  }

  // Note: We don't partial-trigger alertBox here anymore for "critical", 
  // we rely on Claude for the big red alert, unless it's very obvious?
  // Keeping the yellow warning for local detection is fine.
  const now = Date.now();

if (critical) {
  // 🚨 IMPULSIVE → trigger instantly (with cooldown)
  if (isImpulsiveSound(label)) {
    if (now - lastImpulseTime > 2000) { // 2s cooldown
      lastImpulseTime = now;
      alertBox.classList.remove("hidden");
      alertBox.textContent = `🚨 ${label.toUpperCase()}`;
      setTimeout(() => alertBox.classList.add("hidden"), 3000);

      // 👉 CALL CLAUDE IMMEDIATELY HERE
    }
  }
  // 🚨 CONTINUOUS → existing behavior (no change)
  else if (score > 0.08) {
    alertBox.classList.remove("hidden");
    alertBox.textContent = `🚨 ${label.toUpperCase()}`;
    setTimeout(() => alertBox.classList.add("hidden"), 3000);

    // 👉 existing Claude call remains
  }
}

}

startBtn.addEventListener('click', async () => {
  console.log("▶ Start Monitoring");
  startBtn.disabled = true;
  statusText.innerText = "Status: Initializing...";

  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    await audioContext.resume();

    if (!classifier) {
      const audioTasks = await FilesetResolver.forAudioTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@0.10.0/wasm"
      );
      classifier = await AudioClassifier.createFromOptions(audioTasks, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite"
        }
      });
    }

    stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const source = audioContext.createMediaStreamSource(stream);
    processor = audioContext.createScriptProcessor(16384, 1, 1);

    source.connect(processor);
    processor.connect(audioContext.destination);

    startBtn.textContent = "Monitoring Active";
    stopBtn.disabled = false;
    statusText.innerText = "Status: Listening";
    statusText.style.color = "#4cc9f0";

    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      audioBuffer.push(...input);

      if (audioBuffer.length < 16000 || isClassifying) return;

      isClassifying = true;
      const chunk = audioBuffer.slice(0, 16000);
      audioBuffer = audioBuffer.slice(16000);

      let rms = Math.sqrt(chunk.reduce((s, x) => s + x * x, 0) / chunk.length);
      if (rms < 0.005) {
        // Reset sustained tracker on silence
        soundTracker.count = 0;
        soundTracker.label = null;
        isClassifying = false;
        return;
      }

      // ... (Normalization logic same as before) ...
      const processedChunk = new Float32Array(16000);
      const peak = Math.max(...chunk.map(Math.abs));
      if (peak > 0.1) {
        const peakNormFactor = 0.8 / peak;
        for (let i = 0; i < 16000; i++) processedChunk[i] = chunk[i] * peakNormFactor;
      } else {
        const targetRMS = 0.15;
        const normFactor = Math.min(targetRMS / rms, 10);
        for (let i = 0; i < 16000; i++) processedChunk[i] = Math.max(-1, Math.min(1, chunk[i] * normFactor));
      }

      (async () => {
        try {
          const results = classifier.classify(processedChunk);
          if (results && results.length > 0) {
            const categories = results[0].classifications[0].categories;
            // Get top result regardless of threshold for tracking consistency
            const rawTop = categories[0];

            // Filter for display/logic
            const filtered = categories.filter(cat => {
              const label = cat.categoryName.toLowerCase();
              if (isCriticalSound(label)) return cat.score > 0.12;
              return cat.score > 0.10;
            });

            if (filtered.length > 0) {
              const top = filtered[0];
              soundLabel.innerText = top.categoryName;
              confidenceText.innerText = `${(top.score * 100).toFixed(1)}% confidence`;

              const isCritical = isCriticalSound(top.categoryName);

              // LOGIC: Sustained Sound Detection
              // Improved: If both are CRITICAL, we treat them as the same "event" to handle flickering
              // e.g. "Fire Alarm" -> "Alarm" -> "Fire Alarm" should keep counting up.

              const isSameLabel = soundTracker.label === top.categoryName;
              const isFlowingCritical = isCritical && soundTracker.isCritical; // Both are critical

              if (isSameLabel || isFlowingCritical) {
                soundTracker.count++;
                // Update label to the most recent one if it's critical, to ensure we catch the specific type
                if (isCritical) soundTracker.label = top.categoryName;
              } else {
                soundTracker.label = top.categoryName;
                soundTracker.isCritical = isCritical;
                soundTracker.count = 1;
                soundTracker.startTime = Date.now();
              }

              // Visual Log
              if (soundTracker.count === 1 || (isCritical && soundTracker.count % 5 === 0)) {
                // Log start of new sound, or re-log sustained criticals occasionally
                addToLog(top.categoryName, top.score, isCritical);
              }

              // --- ENHANCED TRIGGER LOGIC ---
              // 1. Logic for Impulse Sounds (Gunshot, Glass Break) -> Immediate Trigger
              // 2. Logic for Sustained Sounds (Alarm, Siren) -> Wait for threshold

              const IMPULSE_SOUNDS = [
                'gunshot', 'shot', 'glass', 'break', 'shatter', 'explosion', 'crash'
              ];

              function isImpulseSound(label) {
                const lower = label.toLowerCase();
                return IMPULSE_SOUNDS.some(x => lower.includes(x));
              }

              const now = Date.now();
              const isSustained = soundTracker.count >= SUSTAINED_THRESHOLD;
              const isImpulse = isImpulseSound(top.categoryName);
              const inCooldown = (now - lastTriggerTime) < TRIGGER_COOLDOWN;

              // Condition: Critical AND (Impulse OR Sustained) AND Not in Cooldown
              if (isCritical && (isImpulse || isSustained) && !inCooldown) {
                console.log(`🚀 Triggering Claude. Type: ${isImpulse ? 'IMPULSE' : 'SUSTAINED'}, Label: ${top.categoryName}`);
                lastTriggerTime = now;

                // Add to history
                history.push({ label: top.categoryName, time: new Date().toLocaleTimeString() });
                if (history.length > 5) history.shift();

                sendToServer({
                  label: top.categoryName,
                  confidence: top.score,
                  timestamp: new Date().toISOString(),
                  history: history,
                  userContext: "Deaf user, working at desk." // Can be dynamic later
                });
              }
            } else {
              // Nothing significant detected
              soundTracker.count = 0;
            }
          }
          isClassifying = false;
        } catch (err) {
          console.error("❌ Classification error:", err);
          isClassifying = false;
        }
      })();
    };


  } catch (err) {
    console.error("❌ Setup error:", err);
    statusText.innerHTML = `<span style="color: #ff4d4d;">❌ Error: ${err.message}</span>`;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    startBtn.textContent = "Start Monitoring";
  }
});

stopBtn.addEventListener('click', () => {
  console.log("🛑 Stop Button Triggered");
  isClassifying = false;

  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  if (processor) processor.disconnect();
  if (audioContext) audioContext.close();
  if (stream) stream.getTracks().forEach(track => track.stop());

  // UI Reset
  startBtn.disabled = false;
  stopBtn.disabled = true;
  startBtn.textContent = "Start Monitoring";
  startBtn.classList.remove('active');
  statusText.innerText = "Status: Idle";
  soundLabel.innerText = "—";
  confidenceText.innerText = "—";
  audioLevelBar.style.width = "0%";
  rmsValue.textContent = "0.0000";
  claudeVerdict.innerText = "Waiting for detection...";
  claudeVerdict.className = "";
  claudeReason.innerText = "";
});
