import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const NIM_API_KEY = process.env.NIM_API_KEY;
const NIM_BASE_URL = "https://api.nvidia.com/v1/chat/completions";
// Example model: meta/llama-3.1-8b-instruct
const DEFAULT_MODEL = process.env.NIM_MODEL || "meta/llama-3.1-8b-instruct";

/**
 * OpenAI-compatible endpoint
 */
app.post("/v1/chat/completions", async (req, res) => {
  try {
    const {
      messages,
      model,
      temperature = 0.7,
      max_tokens = 1024,
      stream = false
    } = req.body;

    const nimPayload = {
      model: model || DEFAULT_MODEL,
      messages,
      temperature,
      max_tokens,
      stream
    };

    const nimResponse = await fetch(NIM_BASE_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${NIM_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(nimPayload)
    });

    const data = await nimResponse.json();

    // Convert NIM response → OpenAI format
    const openAIResponse = {
      id: data.id || "chatcmpl-nim",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: model || DEFAULT_MODEL,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: data.choices?.[0]?.message?.content || ""
          },
          finish_reason: "stop"
        }
      ],
      usage: data.usage || {}
    };

    res.json(openAIResponse);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: {
        message: err.message,
        type: "internal_error"
      }
    });
  }
});

app.get("/", (_, res) => {
  res.send("NVIDIA NIM OpenAI-compatible proxy is running.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Proxy running on port ${PORT}`);
});
