import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '15mb' }));

// Helper to get Gemini client
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '' || apiKey.length < 15) {
    return null;
  }
  return new GoogleGenAI();
};

// Local backup storage file for real cross-device persistence
const DATA_DIR = path.resolve(process.cwd(), '.data');
const BACKUP_FILE = path.join(DATA_DIR, 'workspace_backup.json');

if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
    console.warn('Could not create .data dir', e);
  }
}

// 1. Centralized Sync Endpoints
app.get('/api/sync/state', (req, res) => {
  try {
    if (fs.existsSync(BACKUP_FILE)) {
      const data = fs.readFileSync(BACKUP_FILE, 'utf-8');
      return res.json({ success: true, data: JSON.parse(data) });
    }
    return res.json({ success: true, data: null });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/sync/state', (req, res) => {
  try {
    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(payload, null, 2), 'utf-8');
    return res.json({ success: true, savedAt: new Date().toISOString() });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 2. AI Intelligence & Sales Coaching (Powered by Gemini)
app.post('/api/ai/coach', async (req, res) => {
  const { mode, workspace, customQuery } = req.body;
  try {
    const ai = getGeminiClient();

    if (!ai) {
      return res.json({
        analysis: generateDeterministicExecutiveAnalysis(mode, workspace),
        isFallback: true
      });
    }

    const systemPrompt = `You are a high-caliber Luxury Real Estate Sales Operations Director & Chief Commercial Officer for ultra-luxury residential projects in Gurgaon (Golf Course Road, Golf Course Extension, Dwarka Expressway).
Your task is to analyze channel partner (CP) records, deal pipeline, and team performance metrics.
Base every observation strictly on provided data. Never fabricate metrics, targets, or motives.
Distinguish between vanity activity (calls without outcome) and commercial milestones (client meetings, site visits, negotiations, bookings).
Give sharp, concise, actionable advice structured with Apple-like elegance:
- Executive Takeaway (1-2 sentences)
- Highest Leverage Focus (where immediate money or deal velocity is)
- Risk & Friction Points (neglected high-potential CPs, stalling stages)
- Prescribed 48-Hour Action Plan (specific names, specific actions)`;

    const prompt = `Analyze this sales workspace snapshot for Mode: ${mode || 'Executive'}.
${customQuery ? `User Question: "${customQuery}"\n` : ''}
Data snapshot:
${JSON.stringify(workspace, null, 2)}

Provide your executive intelligence report.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.2,
      }
    });

    const analysis = response.text || generateDeterministicExecutiveAnalysis(mode, workspace);
    return res.json({ analysis, isFallback: false });
  } catch (err: any) {
    console.warn('Gemini API call failed, providing deterministic analysis fallback:', err.message);
    return res.json({
      analysis: generateDeterministicExecutiveAnalysis(mode, workspace),
      isFallback: true
    });
  }
});

// 3. AI Meeting Preparation Brief Generator
app.post('/api/ai/meeting-prep', async (req, res) => {
  const { partner, recentActivities, opportunities } = req.body;
  try {
    const ai = getGeminiClient();

    if (!ai) {
      return res.json({
        brief: generateDeterministicMeetingBrief(partner, recentActivities, opportunities),
        isFallback: true
      });
    }

    const systemPrompt = `You are a luxury real estate sales director preparing an account executive for an in-person meeting with a luxury property channel partner (broker).
Create a concise, punchy "Executive Pre-Meeting Briefing" (Apple Keynote style clarity):
1. Context & Relationship Archetype: Who is this broker? (Market, budget niche, past responsiveness)
2. Commercial Status: Active client requirements & pipeline stage
3. Core Meeting Objective: What must be achieved in this meeting (not just catching up—e.g. securing a site visit date for a 4 BHK buyer)
4. Three Calibrated Probing Questions: High-impact questions to reveal real client budgets, timeline, and decision-making
5. Anticipated Objections & Tailored Response: How to position luxury inventory vs competitor projects
6. Desired Next Commitment: The exact commitment to ask before leaving the meeting`;

    const prompt = `Generate a Pre-Meeting Briefing for CP:
${JSON.stringify({ partner, recentActivities, opportunities }, null, 2)}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.3,
      }
    });

    const brief = response.text || generateDeterministicMeetingBrief(partner, recentActivities, opportunities);
    return res.json({ brief, isFallback: false });
  } catch (err: any) {
    console.warn('Meeting prep Gemini failed, using deterministic brief fallback:', err.message);
    return res.json({
      brief: generateDeterministicMeetingBrief(partner, recentActivities, opportunities),
      isFallback: true
    });
  }
});

// 4. AI WhatsApp / Call Opener Generator
app.post('/api/ai/draft-message', async (req, res) => {
  const { partner, channel, tone, objective } = req.body;
  const fallbackMsg = `Hi ${partner?.name || 'there'}, following up on our discussion regarding ${partner?.targetPlan || 'luxury inventory updates'}. We have updated 4 BHK floor plans and pricing milestones ready. Would love to share the unit details and fix a private walkthrough this week. Let me know what day works best.`;

  try {
    const ai = getGeminiClient();

    if (!ai) {
      return res.json({ message: fallbackMsg, isFallback: true });
    }

    const systemPrompt = `You are an elite luxury real estate relationship manager.
Write a personalized ${channel || 'WhatsApp'} message to a channel partner.
Tone: ${tone || 'Polite, professional, high-status, concise'}.
Rules:
- Never send generic "Any updates?" or "Checking in" messages.
- Always provide value (inventory update, price appreciation insight, client matching opportunity).
- End with a low-friction, specific question or proposal.
- Keep under 60-80 words.`;

    const prompt = `Draft follow-up for:
Partner: ${partner?.name} (${partner?.reraName || partner?.company || 'Broker'})
Status: ${partner?.status}
Budget niche: ${partner?.budget || '₹6-12 Cr'}
Last note: ${partner?.notes || 'None'}
Objective: ${objective || partner?.nextAction || 'Book meeting / site visit'}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.4,
      }
    });

    const msg = response.text?.trim() || fallbackMsg;
    return res.json({ message: msg, isFallback: false });
  } catch (err: any) {
    return res.json({ message: fallbackMsg, isFallback: true });
  }
});

// 5. Backward compatibility with claude-worker /coach endpoint
app.post('/coach', async (req, res) => {
  const { mode, workspace } = req.body || {};
  const ai = getGeminiClient();
  if (!ai) {
    return res.json({ analysis: generateDeterministicExecutiveAnalysis(mode, workspace), model: 'gemini-fallback' });
  }
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Mode: ${mode}\n${JSON.stringify(workspace)}`,
    });
    return res.json({ analysis: response.text, model: 'gemini-2.5-flash' });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

function generateDeterministicExecutiveAnalysis(mode: string, workspace: any): string {
  const team = workspace?.team || [];
  const brokers = workspace?.brokers || [];
  const overdueCount = brokers.filter((b: any) => b.overdue).length;

  return `EXECUTIVE REVENUE AUDIT (Local Data Intelligence)

1. Network Health & Operational Pulse
- Active Brokers Monitored: ${brokers.length} partners
- Immediate Overdue Commitments: ${overdueCount} brokers require intervention today
- Portfolio Discipline: Overdue follow-ups represent immediate risk of broker defection to competing developer projects.

2. Team Productivity Diagnosis
${team.map((t: any) => `• ${t.owner}: ${t.assignedCPs} CPs assigned, ${t.cpMeetings || 0} meetings, ${t.clientLeads || 0} client leads, ${t.siteVisits || 0} site visits, ${t.bookings || 0} bookings. Overdue: ${t.overdueCPs || 0}.`).join('\n')}

3. Prescribed 48-Hour Recovery Plan
- Priority 1: Clear all ${overdueCount} overdue broker commitments before initiating new outreach.
- Priority 2: Convert qualified client leads into confirmed physical site visits at the experience center.
- Priority 3: Reallocate unassigned or stale CPs to ensure single-point accountability.`;
}

function generateDeterministicMeetingBrief(partner: any, activities: any[], opportunities: any[]): string {
  return `PRE-MEETING STRATEGY BRIEF: ${partner.reraName || partner.name}

1. PROFILE & RELATIONSHIP CONTEXT
• Contact: ${partner.name} | Firm: ${partner.company || partner.reraName || 'Independent'}
• Current Status: ${partner.status} | Priority: ${partner.priority || 'Standard'}
• Client Budget Profile: ${partner.budget || 'Luxury residential segment'}
• Active Requirements: ${partner.requirements || 0} clients

2. RECENT TOUCHPOINTS
${(activities || []).slice(0, 3).map((a: any) => `• ${a.date}: ${a.type} - ${a.notes || a.outcome || 'Logged'}`).join('\n') || '• No previous meeting records found.'}

3. ACTIVE OPPORTUNITIES
${(opportunities || []).map((o: any) => `• ${o.clientName}: ${o.budget} (${o.stage}) - ${o.nextAction}`).join('\n') || '• No active deals registered yet.'}

4. RECOMMENDED MEETING AGENDA
• Confirm active buyer requirements in the ${partner.budget || '₹6–10 Cr'} range.
• Present updated floor plans and limited launch inventory.
• Secure a confirmed date and time for a client site tour.`;
}

// 5. Standalone HTML Endpoints (For 1-click GitHub Pages & zero-blank-screen offline usage)
app.get('/standalone.html', (req, res) => {
  const filePath = path.resolve(process.cwd(), 'public', 'standalone.html');
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }
  return res.status(404).send('Standalone HTML not found');
});

app.get('/download-standalone-html', (req, res) => {
  const filePath = path.resolve(process.cwd(), 'public', 'standalone.html');
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Disposition', 'attachment; filename="index.html"');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.sendFile(filePath);
  }
  return res.status(404).send('File not found');
});

// Mount Vite in development
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
