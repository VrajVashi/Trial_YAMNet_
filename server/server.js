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
- Current Detection: { label, confidence, timestamp }
- History Window: List of last 20 detected sounds (including low confidence noise).
- User Context: ${userContext || "Deaf user, working at desk"}

ALGORITHM:
1. **Analyze Current Detection**:
   - If confidence is High (>0.8): Very likely real.
   - If confidence is Medium (0.5-0.8): Check history for corroboration.

2. **Analyze History (Pattern Matching)**:
   - Look for **"Corroborating Evidence"**: e.g., if Main Event is "Fire Alarm", look for "Smoke", "Crackle", "Buzzer", or faint "Alarm" in the history.
   - Look for **"Sustained Duration"**: Does the emergency sound appear multiple times?
   - Look for **"Context"**: Does "Dog Bark" precede "Glass Break"? (Intruder scenario).

3. **Verify**:
   - IF (Current is Critical) AND (History has Corroborating Evidence) -> **EMERGENCY (True)**.
   - IF (Current is Critical) AND (Confidence > 0.8) -> **EMERGENCY (True)** (Immediate threat).
   - IF (Current is Isolated/Short) AND (History is calm/unrelated) -> **MONITOR (False)** (Likely transient noise/TV).

PRINCIPLES:
- **Prioritize Recall**: Better to warn a deaf user about a false alarm than miss a fire.
- **Ignore Media**: If history shows standard "Speech", "Music", "Laughter" mixed in, it's likely a TV.

OUTPUT FORMAT (JSON):
{
  "emergency": boolean, 
  "reason": "Clear explanation citing history (e.g. 'Loud alarm detected and corroborated by earlier smoke sound')",
  "recommendation": "Actionable advice (e.g. 'EVACUATE', 'CHECK DOOR')"
}
`;

    const userMessage = JSON.stringify({
      current_detection: { label, confidence, timestamp },
      history_window: history,
      user_context: userContext
    });

    const message = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    });

    const text = message.content[0].text;

    // Clean up markdown formatting if present
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();

    // Attempt to extract JSON if there's still extra text
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : cleanText;

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
