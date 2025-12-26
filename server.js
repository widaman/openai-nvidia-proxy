// NVIDIA NIM to OpenAI API Proxy Server
// Deploy this to any Node.js hosting service (Vercel, Railway, Render, etc.)

const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const NVIDIA_API_BASE = 'https://integrate.api.nvidia.com/v1';

// Main proxy endpoint
app.post('/v1/chat/completions', async (req, res) => {
  try {
    const openaiRequest = req.body;
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing NVIDIA API key' });
    }

    const nvidiaKey = authHeader.replace('Bearer ', '');

    // Translate OpenAI request to NVIDIA NIM format
    const nvidiaRequest = {
      model: openaiRequest.model || 'meta/llama-3.1-405b-instruct',
      messages: openaiRequest.messages,
      temperature: openaiRequest.temperature || 0.7,
      top_p: openaiRequest.top_p || 1,
      max_tokens: openaiRequest.max_tokens || 1024,
      stream: openaiRequest.stream || false
    };

    const response = await fetch(`${NVIDIA_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${nvidiaKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(nvidiaRequest)
    });

    if (!response.ok) {
      const error = await response.text();
      return res.status(response.status).json({ 
        error: `NVIDIA API error: ${error}` 
      });
    }

    // Handle streaming
    if (nvidiaRequest.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value));
      }
      res.end();
    } else {
      const data = await response.json();
      res.json(data);
    }
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Models endpoint
app.get('/v1/models', async (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing NVIDIA API key' });
  }

  const nvidiaKey = authHeader.replace('Bearer ', '');

  try {
    const response = await fetch(`${NVIDIA_API_BASE}/models`, {
      headers: {
        'Authorization': `Bearer ${nvidiaKey}`
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ 
        error: 'Failed to fetch models' 
      });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'nvidia-openai-proxy' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});
