// NVIDIA NIM to OpenAI API Proxy Server
// For Vercel Serverless Functions

const NVIDIA_API_BASE = 'https://integrate.api.nvidia.com/v1';

// Helper function to handle CORS
const setCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
};

// Main serverless function
export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    return res.status(200).end();
  }

  setCorsHeaders(res);

  try {
    const { method, url } = req;
    const authHeader = req.headers.authorization;

    // Check for API key
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: { message: 'Missing NVIDIA API key in Authorization header' } 
      });
    }

    const nvidiaKey = authHeader.replace('Bearer ', '');

    // Handle chat completions
    if (method === 'POST' && url.includes('/chat/completions')) {
      const openaiRequest = req.body;

      // Translate to NVIDIA format
      const nvidiaRequest = {
        model: openaiRequest.model || 'meta/llama-3.1-405b-instruct',
        messages: openaiRequest.messages,
        temperature: openaiRequest.temperature ?? 0.7,
        top_p: openaiRequest.top_p ?? 1,
        max_tokens: openaiRequest.max_tokens ?? 1024,
        stream: openaiRequest.stream ?? false
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
        const errorText = await response.text();
        return res.status(response.status).json({ 
          error: { message: `NVIDIA API error: ${errorText}` }
        });
      }

      // Handle streaming
      if (nvidiaRequest.stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(decoder.decode(value));
          }
        } finally {
          res.end();
        }
      } else {
        const data = await response.json();
        return res.status(200).json(data);
      }
    }

    // Handle models list
    else if (method === 'GET' && url.includes('/models')) {
      const response = await fetch(`${NVIDIA_API_BASE}/models`, {
        headers: {
          'Authorization': `Bearer ${nvidiaKey}`
        }
      });

      if (!response.ok) {
        return res.status(response.status).json({ 
          error: { message: 'Failed to fetch models' }
        });
      }

      const data = await response.json();
      return res.status(200).json(data);
    }

    // Health check
    else if (method === 'GET' && (url === '/' || url.includes('/health'))) {
      return res.status(200).json({ 
        status: 'ok', 
        service: 'nvidia-openai-proxy',
        version: '1.0.0'
      });
    }

    // Unknown endpoint
    else {
      return res.status(404).json({ 
        error: { message: 'Endpoint not found' }
      });
    }

  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({ 
      error: { message: error.message || 'Internal server error' }
    });
  }
          }
