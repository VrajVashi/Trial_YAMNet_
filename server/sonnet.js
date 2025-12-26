import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

export async function analyzeSound(label, score) {
  const prompt = `
A sound was detected by an edge AI system.

Sound label: ${label}
Confidence: ${score}

The user is deaf or hard of hearing.
Determine if this is likely a real emergency.
Respond in JSON with:
- emergency: true/false
- instruction: short safety instruction
`;

  const response = await client.messages.create({
    model: "claude-3-5-sonnet-20240620",
    max_tokens: 150,
    messages: [{ role: "user", content: prompt }]
  });

  const text = response.content[0].text;

  // Simple heuristic parse (hackathon-safe)
  return {
    emergency: true,
    instruction: text
  };
}
