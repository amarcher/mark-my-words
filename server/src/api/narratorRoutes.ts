import { Router } from 'express';
import { neon } from '@neondatabase/serverless';

const router = Router();

function logUsage(service: string, endpoint: string, data: { tokensIn?: number; tokensOut?: number; characters?: number; model?: string }) {
  const dbUrl = process.env.DASHBOARD_DATABASE_URL;
  if (!dbUrl) return;
  const sql = neon(dbUrl);
  sql`INSERT INTO api_usage (project, service, endpoint, tokens_in, tokens_out, characters, model)
    VALUES ('mark-my-words', ${service}, ${endpoint}, ${data.tokensIn ?? 0}, ${data.tokensOut ?? 0}, ${data.characters ?? 0}, ${data.model ?? null})`.catch((e) =>
    console.error(`[narrator/${endpoint}] usage log failed:`, e)
  );
}

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

    const data = await response.json() as { content: Array<{ text: string }>; usage?: { input_tokens: number; output_tokens: number } };
    if (data.usage) {
      logUsage('anthropic', 'narrator-claude', { tokensIn: data.usage.input_tokens, tokensOut: data.usage.output_tokens, model: 'claude-sonnet-4-20250514' });
    }
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

    logUsage('elevenlabs', 'narrator-tts', { characters: text.length });
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
