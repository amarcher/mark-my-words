import { Router } from 'express';
import { gateMiddleware } from './gateMiddleware.js';

const router = Router();
router.use(gateMiddleware);

// POST /api/narrator/claude — proxy to Anthropic Messages API
router.post('/claude', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });
    return;
  }

  try {
    const { messages, systemPrompt } = req.body;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 256,
        system: systemPrompt,
        messages,
      }),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      res.status(response.status).json({ error: `Anthropic API error: ${response.status} ${err}` });
      return;
    }

    const data = await response.json() as { content: Array<{ text: string }> };
    const text = data.content?.[0]?.text ?? '';
    res.json({ text });
  } catch (err) {
    console.error('[narrator/claude] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/narrator/tts — proxy to ElevenLabs TTS
router.post('/tts', async (req, res) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'ELEVENLABS_API_KEY not set' });
    return;
  }

  try {
    const { text, voice_id } = req.body;
    const voiceId = voice_id || '21m00Tcm4TlvDq8ikWAM'; // Rachel default
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_flash_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      res.status(response.status).json({ error: `ElevenLabs TTS error: ${response.status} ${err}` });
      return;
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    console.error('[narrator/tts] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/narrator/agent-auth — ElevenLabs signed WebSocket URL
router.post('/agent-auth', async (_req, res) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!apiKey || !agentId) {
    res.status(500).json({ error: 'ElevenLabs agent not configured' });
    return;
  }

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
      {
        method: 'GET',
        headers: { 'xi-api-key': apiKey },
      },
    );

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      res.status(response.status).json({ error: `Agent auth error: ${response.status} ${err}` });
      return;
    }

    const data = await response.json() as { signed_url: string };
    res.json({ signed_url: data.signed_url });
  } catch (err) {
    console.error('[narrator/agent-auth] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/narrator/openai-agent-auth — OpenAI ephemeral realtime token
router.post('/openai-agent-auth', async (_req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'OPENAI_API_KEY not set' });
    return;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      res.status(response.status).json({ error: `OpenAI auth error: ${response.status} ${err}` });
      return;
    }

    const data = await response.json() as { client_secret: { value: string } };
    res.json({ token: data.client_secret.value });
  } catch (err) {
    console.error('[narrator/openai-agent-auth] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
