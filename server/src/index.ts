import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth.js';
import { optionalAuth } from './middleware/auth.js';
import { tracing } from './middleware/tracing.js';
import projectsRouter from './routes/projects.js';
import executeRouter from './routes/execute.js';
import eventsRouter from './routes/events.js';
import oauthRouter from './routes/oauth.js';
import credentialsRouter from './routes/credentials.js';

const app = express();
const PORT = process.env.PORT || 3001;

// CORS — allow frontend origins
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

// Request tracing — generates x-request-id, logs duration
app.use(tracing);

// Better Auth handles its own body parsing — mount BEFORE express.json()
app.all('/api/auth/*', (req, res) => {
  return toNodeHandler(auth)(req, res);
});

// JSON body parsing for everything else
app.use(express.json({ limit: '10mb' }));

// Populate req.user from session cookie (non-blocking)
app.use('/api', optionalAuth as any);

// Routes
app.use('/api/projects', projectsRouter);
app.use('/api/execute', executeRouter);
app.use('/api/events', eventsRouter);
app.use('/api/oauth', oauthRouter);
app.use('/api/credentials', credentialsRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Only start listening in non-serverless environments
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
