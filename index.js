import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

/* ===============================
   ENVIRONMENT VARIABLES
================================ */

const NIM_API_KEY = process.env.NIM_API_KEY; // nvapi-xxxx
const NIM_FUNCTION_ID = process.env.NIM_FUNCTION_ID; // REQUIRED
const DEFAULT_MODEL = process.env.NIM_MODEL || "meta/llama-3.1-8b-instruct";

/* ===============================
   MODEL ALIASING (JANITOR FIX)
================================ */

const MODEL_MAP = {
  "gpt-4": DEFAULT_MODEL,
  "gpt-4o": DEFAULT_MODEL,
  "gpt-3.5-turbo": DEFAULT_MODEL
};

/* ===============================
   NVIDIA NIM (NVCF) ENDPOINT
================================ */

const NIM_BASE_URL = `https://api.nvcf.nvidia.com/v2/nvcf/pexec/functions/${NIM_FUNCTION_ID}`;

/* ===============================
   OPENAI-COMPATIBLE ENDPOINT
================================ */

app.post("/v1/chat/completions", async (req, res) => {
  try {
    // Janitor ALWAYS sends Authorization – accept but ignore value
    if (!req.headers.authorization) {
      return res.status(401).json({
        error: { message: "Missing Authorization header" }
      });
    }

    const body = req.body;

    if (!Array.isArray(body.messages)) {
      return res.status(400).json({
        error: { message: "Invalid messages format" }
      });
    }

    // Resolve model alias
    const requestedModel = body.model;
    const resolvedModel =
      MODEL_MAP[requestedModel] || requestedModel || DEFAULT_MODEL;

    /* ===============================
       NVIDIA NIM PAYLOAD FORMAT
    ================================ */

    const nimPayload = {
      inputs: [
        {
          messages: body.messages
        }
      ]
    };

    const nimResponse = await fetch(NIM_BASE_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${NIM_API_KEY}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(nimPayload)
    });

    const data = await nimResponse.json();

    /* ===============================
       OPENAI RESPONSE FORMAT
    ================================ */

    const content =
      data?.outputs?.[0]?.choices?.[0]?.message?.content ?? "";

    res.json({
      id: "chatcmpl-nim",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: resolvedModel,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content
          },
          finish_reason: "stop"
        }
      ],
      usage: {}
    });
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

/* ===============================
   HEALTH CHECK
================================ */

app.get("/", (_, res) => {
  res.send("NVIDIA NIM → OpenAI proxy running");
});

/* ===============================
   SERVER
================================ */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Proxy running on port ${PORT}`);
});
