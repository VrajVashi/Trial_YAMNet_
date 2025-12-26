import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Anthropic } from "@anthropic-ai/sdk";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from the client folder
app.use(express.static(path.join(__dirname, "../client")));

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

app.post("/verify-sound", async (req, res) => {
  try {
    const { label, confidence, timestamp, history, userContext } = req.body;

    const systemPrompt = `
You are the "Safety Officer" for Silent Sentinel, a system for deaf/hard-of-hearing users.
Your Goal: Analyze a specific sound detection to decide if the user must be alerted.

INPUT DATA:
- Sound Label: The sound detected by YAMNet.
- Confidence: Model confidence (0.0-1.0).
- History: Recent sound detections.
- Context: User is deaf/hoh. They CANNOT hear alarms, glass breaking, or shouts.

PRINCIPLES:
1. **IGNORE** background media (TV, Movies, Music) unless it persists alarmingly.
2. **ESCALATE** Life-safety sounds immediately: Fire Alarms, Smoke Detectors, Carbon Monoxide Alarms.
3. **ESCALATE** Security sounds: Broken Glass, Forced Entry, Screaming.
4. **WARN** Important but non-critical: Doorbells, Knocking (if repeated).
5. **IGNORE** Common noise: Coughing, Sneezing, Typing, Traffic (unless crash).

OUTPUT FORMAT:
Return STRICT JSON ONLY. No markdown.
{
  "emergency": boolean, // true if immediate action is needed
  "reason": "Short, urgent explanation (max 10 words)",
  "recommendation": "Clear action for the user (e.g., 'EVACUATE', 'Check Door', 'Ignore')"
}

Example 1:
Input: "Smoke Detector", 0.95
Output: { "emergency": true, "reason": "Fire alarm detected", "recommendation": "EVACUATE NOW" }

Example 2:
Input: "TV", 0.6
Output: { "emergency": false, "reason": "Background media noise", "recommendation": "Ignore" }
`;

    const userMessage = JSON.stringify({
      current_detection: { label, confidence, timestamp },
      history_window: history,
      user_context: userContext || "Standard Deaf/HoH User"
    });

    const message = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 200,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    });

    const text = message.content[0].text;

    // Attempt to extract JSON if Claude adds extra text (though we asked it not to)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : text;

    const parsed = JSON.parse(jsonStr);

    res.json(parsed);
  } catch (err) {
    console.error("Claude error:", err);
    // Fallback safe response
    res.status(500).json({
      emergency: false,
      reason: "Verification couldn't complete",
      recommendation: "Check manually"
    });
  }
});

// Start server on port 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
  console.log(`👉 Open http://localhost:${PORT} to view the app`);
});
