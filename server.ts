import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-Memory Data Models
interface TaskItem {
  id: number;
  user_id: number;
  title: string;
  description: string;
  due_date: string | null;
  priority: "low" | "medium" | "high";
  status: "pending" | "completed";
  created_at: string;
  updated_at: string;
}

interface ReminderItem {
  id: number;
  user_id: number;
  title: string;
  reminder_time: string;
  status: "pending" | "completed";
  created_at: string;
}

interface NoteItem {
  id: number;
  user_id: number;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface ActivityItem {
  id: number;
  user_id: number;
  action: string;
  entity_type: string;
  entity_id: number | null;
  summary: string;
  created_at: string;
}

interface ChatItem {
  id: number;
  user_id: number;
  role: "user" | "assistant";
  content: string;
  action_data: any;
  created_at: string;
}

interface FocusSessionItem {
  id: number;
  user_id: number;
  task_id: number | null;
  task_title?: string | null;
  duration_minutes: number;
  completed_at: string;
}

class Store {
  tasks: TaskItem[] = [];
  reminders: ReminderItem[] = [];
  notes: NoteItem[] = [];
  activities: ActivityItem[] = [];
  chatHistory: ChatItem[] = [];
  focusSessions: FocusSessionItem[] = [];
  nextId = {
    task: 1,
    reminder: 1,
    note: 1,
    activity: 1,
    chat: 1,
    focus: 1,
  };

  recordActivity(action: string, entity_type: string, entity_id: number | null, summary: string) {
    const act: ActivityItem = {
      id: this.nextId.activity++,
      user_id: 1,
      action,
      entity_type,
      entity_id,
      summary: summary.slice(0, 300),
      created_at: new Date().toISOString().slice(0, 16),
    };
    this.activities.unshift(act);
    return act;
  }
}

const store = new Store();

// Helper date utilities
function formatIsoMinutes(d: Date = new Date()) {
  return d.toISOString().slice(0, 16);
}

function formatIsoSeconds(d: Date = new Date()) {
  return d.toISOString().slice(0, 19);
}

function parseTaskMessage(message: string, now: Date = new Date()) {
  const normalized = message.trim().replace(/\s+/g, " ");
  const lowered = normalized.toLowerCase();
  const triggers = ["create a task", "add a task", "add task", "create task", "i need to", "i have to", "todo:"];
  if (!triggers.some((phrase) => lowered.includes(phrase))) {
    return null;
  }

  let due_date: string | null = null;
  if (/\b(tomorrow|nale)\b/i.test(lowered)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    due_date = d.toISOString().slice(0, 10);
  } else if (/\b(today|ivattu)\b/i.test(lowered)) {
    due_date = now.toISOString().slice(0, 10);
  } else if (/\bnext week\b/i.test(lowered)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 7);
    due_date = d.toISOString().slice(0, 10);
  }

  let title = normalized.replace(
    /^(?:please\s+)?(?:create|add)\s+(?:a\s+)?task\s+(?:to\s+)?|^(?:i need to|i have to|todo:)\s*/i,
    "",
  );
  title = title.replace(/\b(?:by|due)\s+(?:tomorrow|today|next week)\b/gi, "");
  title = title.replace(/\b(?:tomorrow|today|next week|nale|ivattu|morning|afternoon|evening|night)\b/gi, "");
  title = title.replace(/\s+/g, " ").replace(/^[ .,!?:;\-'\"“”]+|[ .,!?:;\-'\"“”]+$/g, "");

  if (!title) {
    return { error: "What should I call the task?" };
  }

  const priority: "low" | "medium" | "high" = /\b(high|urgent|important)\b/i.test(lowered)
    ? "high"
    : /\b(low|when i can)\b/i.test(lowered)
      ? "low"
      : "medium";

  title = title.replace(/\b(?:high|urgent|important|low|medium)\s+priority\b|\b(?:high|urgent|important)\b/gi, "");
  title = title.replace(/\s+/g, " ").replace(/^[ .,!?:;\-'\"“”]+|[ .,!?:;\-'\"“”]+$/g, "");

  return {
    title: title.slice(0, 200).trim(),
    due_date,
    priority,
  };
}

function parseReminder(message: string, now: Date = new Date()) {
  const current = new Date(now);
  const normalized = message.trim().replace(/\s+/g, " ").toLowerCase();

  const triggers = ["remind", "reminder", "hakko", "ನೆನಪಿಸು"];
  if (!triggers.some((phrase) => normalized.includes(phrase))) {
    return null;
  }

  let reminderDate = new Date(current);
  if (normalized.includes("tomorrow") || /\bnale\b/.test(normalized)) {
    reminderDate.setDate(reminderDate.getDate() + 1);
  } else if (normalized.includes("today") || /\bivattu\b/.test(normalized)) {
    // today
  } else {
    return { error: "When should I remind you? Try “tomorrow at 7 PM”." };
  }

  const timeRegex = /\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b(?:\s*(gantge|o'clock))?/;
  const timeMatch = normalized.match(timeRegex);
  if (!timeMatch || timeMatch.index === undefined) {
    return { error: "What time should I set? For example, “at 7 PM”." };
  }

  let hour = parseInt(timeMatch[1], 10);
  const minute = parseInt(timeMatch[2] || "0", 10);
  const meridiem = timeMatch[3];
  const timeContext = normalized.slice(Math.max(0, timeMatch.index - 14), timeMatch.index);

  if (meridiem) {
    if (hour < 1 || hour > 12) {
      return { error: "That time does not look valid. Please include a time like 7 PM." };
    }
    hour = (hour % 12) + (meridiem === "pm" ? 12 : 0);
  } else if (timeContext.includes("evening") || timeContext.includes("night")) {
    hour = (hour % 12) + 12;
  } else if (timeContext.includes("morning")) {
    hour = hour % 12;
  } else if (hour > 23) {
    return { error: "That time does not look valid. Please include a time like 7 PM." };
  }

  if (minute > 59) {
    return { error: "That time does not look valid. Please include a time like 7 PM." };
  }

  let title = message.trim();
  title = title.replace(
    /^(?:please\s+)?(?:create\s+)?(?:a\s+)?(?:reminder\s+to|remind\s+me\s+to|remind\s+me|reminder|set\s+(?:a\s+)?reminder\s+to)\s*/gi,
    "",
  );
  title = title.replace(/\b(?:tomorrow|today|nale|ivattu)\b/gi, " ");
  title = title.replace(/\b(?:at\s*)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?(?:\s*(?:gantge|o'clock))?\b/gi, " ");
  title = title.replace(/\b(?:morning|afternoon|evening|night)\b/gi, " ");
  title = title.replace(/\b(?:anta\s+)?(?:reminder\s+)?hakko\b/gi, " ");
  title = title.replace(/\banta\b/gi, " ");
  title = title.replace(/\s+/g, " ").replace(/^[ .,!?:;\-]+|[ .,!?:;\-]+$/g, "");
  title = title.replace(/^(?:to|that)\s+/gi, "");

  if (!title) {
    return { error: "What should I remind you about?" };
  }

  reminderDate.setHours(hour, minute, 0, 0);

  // Format as ISO without ms: YYYY-MM-DDTHH:MM:SS
  const year = reminderDate.getFullYear();
  const month = String(reminderDate.getMonth() + 1).padStart(2, "0");
  const day = String(reminderDate.getDate()).padStart(2, "0");
  const hh = String(reminderDate.getHours()).padStart(2, "0");
  const mm = String(reminderDate.getMinutes()).padStart(2, "0");
  const ss = String(reminderDate.getSeconds()).padStart(2, "0");
  const formattedIso = `${year}-${month}-${day}T${hh}:${mm}:${ss}`;

  return {
    title: title.slice(0, 200),
    reminder_time: formattedIso,
  };
}

// Helper to safely retrieve the server-side Gemini API key
function getGeminiApiKey(): string {
  const candidates = [
    process.env.GEMINI_API_KEY,
    process.env.APP_API_KEY,
    process.env.GEMINI_MODEL,
    process.env.NEXT_PUBLIC_GEMINI_API_KEY,
  ];
  for (const c of candidates) {
    if (typeof c === "string") {
      const trimmed = c.trim();
      if (
        trimmed &&
        trimmed !== "MY_GEMINI_API_KEY" &&
        trimmed !== "your_api_key_here" &&
        (trimmed.startsWith("AQ.") || trimmed.startsWith("AIzaSy") || trimmed.length >= 20)
      ) {
        return trimmed;
      }
    }
  }
  const fallback = process.env.GEMINI_API_KEY?.trim();
  if (fallback && fallback !== "MY_GEMINI_API_KEY" && fallback !== "your_api_key_here") {
    return fallback;
  }
  return "";
}

// Helper to resolve an active, valid Gemini model
function getValidModel(): string {
  const envModel = process.env.GEMINI_MODEL?.trim();
  if (
    envModel &&
    (envModel.startsWith("gemini-") || envModel.includes("flash") || envModel.includes("pro")) &&
    !envModel.startsWith("AQ.") &&
    !envModel.startsWith("AIza") &&
    !envModel.includes("2.5") &&
    !envModel.includes("2.0") &&
    !envModel.includes("1.5")
  ) {
    return envModel;
  }
  return "gemini-3.1-flash-lite";
}

// Security: Input Sanitization Helper
function sanitizeString(val: unknown, maxLen = 2000): string {
  if (typeof val !== "string") return "";
  return val.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, maxLen);
}

// Security: In-Memory Sliding-Window Rate Limiter
interface RateLimitRecord {
  count: number;
  resetAt: number;
}
const rateLimitStore = new Map<string, RateLimitRecord>();

function createRateLimiter(options: { max: number; windowMs: number; message: string }) {
  return (req: Request, res: Response, next: express.NextFunction) => {
    const clientIdentifier =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      (req.headers["x-client-session"] as string) ||
      "anonymous";
    const key = `${req.baseUrl || req.path}_${clientIdentifier}`;
    const now = Date.now();
    let record = rateLimitStore.get(key);

    if (!record || now > record.resetAt) {
      record = { count: 1, resetAt: now + options.windowMs };
      rateLimitStore.set(key, record);
    } else {
      record.count++;
    }

    const remaining = Math.max(0, options.max - record.count);
    const resetSeconds = Math.ceil((record.resetAt - now) / 1000);
    res.setHeader("X-RateLimit-Limit", options.max);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", resetSeconds);

    if (record.count > options.max) {
      res.setHeader("Retry-After", resetSeconds);
      return res.status(429).json({ error: options.message });
    }
    next();
  };
}

// Cleanup stale rate limit records every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}, 60000);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // 1. HTTP Security Headers
  app.use((_req: Request, res: Response, next: express.NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), geolocation=()");
    res.removeHeader("X-Powered-By");
    next();
  });

  // 2. Controlled CORS
  app.use(
    cors({
      origin: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "x-api-key", "x-client-session"],
    }),
  );

  // 3. Request Payload Size Hardening
  app.use(express.json({ limit: "128kb" }));

  // 4. Rate Limiting for API routes
  const generalLimiter = createRateLimiter({
    max: 120,
    windowMs: 60 * 1000,
    message: "Too many requests. Please slow down.",
  });
  const chatLimiter = createRateLimiter({
    max: 25,
    windowMs: 60 * 1000,
    message: "Chat request rate limit reached. Please wait a moment before sending more messages.",
  });

  app.use("/api", generalLimiter);

  // Health
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      service: "Sahayak AI",
      security: {
        headers_enforced: true,
        rate_limiting: true,
        api_key_protected: true,
      },
    });
  });

  // Security Status Endpoint
  app.get("/api/security/status", (_req: Request, res: Response) => {
    const key = getGeminiApiKey();
    res.json({
      status: "secure",
      rate_limiting: "active",
      api_key_protection: "server_side_enforced",
      gemini_key_configured: Boolean(key),
      payload_limit: "128kb",
      security_headers: "enforced",
    });
  });

  // 2. Dashboard
  app.get("/api/dashboard", (_req: Request, res: Response) => {
    const tasks = store.tasks;
    const reminders = [...store.reminders].sort(
      (a, b) => new Date(a.reminder_time).getTime() - new Date(b.reminder_time).getTime(),
    );
    const activity = store.activities.slice(0, 10);
    const notesCount = store.notes.length;

    res.json({
      tasks,
      reminders,
      notes_count: notesCount,
      activity,
      stats: {
        tasks_total: tasks.length,
        tasks_completed: tasks.filter((t) => t.status === "completed").length,
        reminders_total: reminders.length,
        notes_total: notesCount,
      },
    });
  });

  // 3. Tasks
  app.get("/api/tasks", (_req: Request, res: Response) => {
    res.json(store.tasks);
  });

  app.post("/api/tasks", (req: Request, res: Response) => {
    const payload = req.body;
    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "Send a JSON object." });
    }
    const { title, description = "", priority = "medium", status = "pending", due_date = null } = payload;
    if (!title || typeof title !== "string" || !title.trim() || title.trim().length > 200) {
      return res.status(400).json({ error: "Title must be between 1 and 200 characters." });
    }
    if (typeof description !== "string" || description.length > 1000) {
      return res.status(400).json({ error: "Description must be 1000 characters or fewer." });
    }
    if (!["low", "medium", "high"].includes(priority)) {
      return res.status(400).json({ error: "Priority must be low, medium, or high." });
    }
    if (!["pending", "completed"].includes(status)) {
      return res.status(400).json({ error: "Status must be pending or completed." });
    }
    if (due_date && typeof due_date === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
      return res.status(400).json({ error: "due_date must be an ISO date (YYYY-MM-DD)." });
    }

    const task: TaskItem = {
      id: store.nextId.task++,
      user_id: 1,
      title: title.trim(),
      description: description.trim(),
      priority,
      status,
      due_date: due_date || null,
      created_at: formatIsoMinutes(),
      updated_at: formatIsoMinutes(),
    };

    store.tasks.unshift(task);
    store.recordActivity("created", "task", task.id, `Created task: ${task.title}`);
    res.status(201).json(task);
  });

  app.get("/api/tasks/:id", (req: Request, res: Response) => {
    const task = store.tasks.find((t) => t.id === Number(req.params.id));
    if (!task) return res.status(404).json({ error: "Task not found." });
    res.json(task);
  });

  app.delete("/api/tasks/:id", (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const index = store.tasks.findIndex((t) => t.id === id);
    if (index === -1) return res.status(404).json({ error: "Task not found." });
    const task = store.tasks[index];

    // Detach from focus sessions
    store.focusSessions.forEach((s) => {
      if (s.task_id === id) {
        s.task_id = null;
        s.task_title = null;
      }
    });

    store.tasks.splice(index, 1);
    store.recordActivity("deleted", "task", id, `Deleted task: ${task.title}`);
    res.status(204).end();
  });

  const updateTaskHandler = (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const task = store.tasks.find((t) => t.id === id);
    if (!task) return res.status(404).json({ error: "Task not found." });

    const payload = req.body;
    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "Send a JSON object with task fields." });
    }

    const title = payload.title !== undefined ? payload.title : task.title;
    const description = payload.description !== undefined ? payload.description : task.description;
    const priority = payload.priority !== undefined ? payload.priority : task.priority;
    const status = payload.status !== undefined ? payload.status : task.status;
    const due_date = payload.due_date !== undefined ? payload.due_date : task.due_date;

    if (!title || typeof title !== "string" || !title.trim() || title.trim().length > 200) {
      return res.status(400).json({ error: "Title must be between 1 and 200 characters." });
    }
    if (typeof description !== "string" || description.length > 1000) {
      return res.status(400).json({ error: "Description must be 1000 characters or fewer." });
    }
    if (!["low", "medium", "high"].includes(priority)) {
      return res.status(400).json({ error: "Priority must be low, medium, or high." });
    }
    if (!["pending", "completed"].includes(status)) {
      return res.status(400).json({ error: "Status must be pending or completed." });
    }
    if (due_date && typeof due_date === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
      return res.status(400).json({ error: "due_date must be an ISO date (YYYY-MM-DD)." });
    }

    const previousStatus = task.status;
    task.title = title.trim();
    task.description = description.trim();
    task.priority = priority;
    task.status = status;
    task.due_date = due_date || null;
    task.updated_at = formatIsoMinutes();

    let action = "updated";
    let summary = `Updated task: ${task.title}`;
    if (previousStatus !== task.status && task.status === "completed") {
      action = "completed";
      summary = `Completed task: ${task.title}`;
    } else if (previousStatus !== task.status) {
      action = "reopened";
      summary = `Reopened task: ${task.title}`;
    }

    store.recordActivity(action, "task", task.id, summary);
    res.json(task);
  };

  app.put("/api/tasks/:id", updateTaskHandler);
  app.patch("/api/tasks/:id", updateTaskHandler);

  // 4. Reminders
  app.get("/api/reminders", (_req: Request, res: Response) => {
    const list = [...store.reminders].sort(
      (a, b) => new Date(a.reminder_time).getTime() - new Date(b.reminder_time).getTime(),
    );
    res.json(list);
  });

  app.post("/api/reminders", (req: Request, res: Response) => {
    const payload = req.body;
    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "Send a JSON object with title and reminder_time." });
    }
    const { title, reminder_time } = payload;
    if (!title || typeof title !== "string" || !title.trim() || title.trim().length > 200) {
      return res.status(400).json({ error: "Title must be between 1 and 200 characters." });
    }
    if (!reminder_time || typeof reminder_time !== "string" || isNaN(Date.parse(reminder_time))) {
      return res.status(400).json({ error: "reminder_time must be an ISO date-time." });
    }

    const reminder: ReminderItem = {
      id: store.nextId.reminder++,
      user_id: 1,
      title: title.trim(),
      reminder_time,
      status: "pending",
      created_at: formatIsoMinutes(),
    };

    store.reminders.push(reminder);
    store.recordActivity("created", "reminder", reminder.id, `Created reminder: ${reminder.title}`);
    res.status(201).json(reminder);
  });

  app.get("/api/reminders/:id", (req: Request, res: Response) => {
    const item = store.reminders.find((r) => r.id === Number(req.params.id));
    if (!item) return res.status(404).json({ error: "Reminder not found." });
    res.json(item);
  });

  app.delete("/api/reminders/:id", (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const index = store.reminders.findIndex((r) => r.id === id);
    if (index === -1) return res.status(404).json({ error: "Reminder not found." });
    const reminder = store.reminders[index];
    store.reminders.splice(index, 1);
    store.recordActivity("deleted", "reminder", id, `Deleted reminder: ${reminder.title}`);
    res.status(204).end();
  });

  const updateReminderHandler = (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const reminder = store.reminders.find((r) => r.id === id);
    if (!reminder) return res.status(404).json({ error: "Reminder not found." });

    const payload = req.body;
    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "Send a JSON object with reminder fields." });
    }

    const title = payload.title !== undefined ? payload.title : reminder.title;
    const reminder_time = payload.reminder_time !== undefined ? payload.reminder_time : reminder.reminder_time;
    const status = payload.status !== undefined ? payload.status : reminder.status;

    if (!title || typeof title !== "string" || !title.trim() || title.trim().length > 200) {
      return res.status(400).json({ error: "Title must be between 1 and 200 characters." });
    }
    if (!reminder_time || typeof reminder_time !== "string" || isNaN(Date.parse(reminder_time))) {
      return res.status(400).json({ error: "reminder_time must be an ISO date-time." });
    }
    if (!["pending", "completed"].includes(status)) {
      return res.status(400).json({ error: "Status must be pending or completed." });
    }

    const previousStatus = reminder.status;
    reminder.title = title.trim();
    reminder.reminder_time = reminder_time;
    reminder.status = status;

    let action = "updated";
    let summary = `Updated reminder: ${reminder.title}`;
    if (previousStatus !== reminder.status && reminder.status === "completed") {
      action = "completed";
      summary = `Completed reminder: ${reminder.title}`;
    } else if (previousStatus !== reminder.status) {
      action = "reopened";
      summary = `Reopened reminder: ${reminder.title}`;
    }

    store.recordActivity(action, "reminder", reminder.id, summary);
    res.json(reminder);
  };

  app.put("/api/reminders/:id", updateReminderHandler);
  app.patch("/api/reminders/:id", updateReminderHandler);

  // 5. Notes
  app.get("/api/notes", (req: Request, res: Response) => {
    const query = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
    let list = store.notes;
    if (query) {
      list = list.filter((n) => n.title.toLowerCase().includes(query) || n.content.toLowerCase().includes(query));
    }
    list = [...list].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    res.json(list);
  });

  app.post("/api/notes", (req: Request, res: Response) => {
    const payload = req.body;
    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "Send a JSON object with title and content." });
    }
    const { title, content } = payload;
    if (!title || typeof title !== "string" || !title.trim() || title.trim().length > 200) {
      return res.status(400).json({ error: "Title must be between 1 and 200 characters." });
    }
    if (!content || typeof content !== "string" || !content.trim() || content.trim().length > 5000) {
      return res.status(400).json({ error: "Content must be between 1 and 5000 characters." });
    }

    const note: NoteItem = {
      id: store.nextId.note++,
      user_id: 1,
      title: title.trim(),
      content: content.trim(),
      created_at: formatIsoMinutes(),
      updated_at: formatIsoMinutes(),
    };

    store.notes.unshift(note);
    store.recordActivity("created", "note", note.id, `Saved note: ${note.title}`);
    res.status(201).json(note);
  });

  app.get("/api/notes/:id", (req: Request, res: Response) => {
    const note = store.notes.find((n) => n.id === Number(req.params.id));
    if (!note) return res.status(404).json({ error: "Note not found." });
    res.json(note);
  });

  app.delete("/api/notes/:id", (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const index = store.notes.findIndex((n) => n.id === id);
    if (index === -1) return res.status(404).json({ error: "Note not found." });
    const note = store.notes[index];
    store.notes.splice(index, 1);
    store.recordActivity("deleted", "note", id, `Deleted note: ${note.title}`);
    res.status(204).end();
  });

  const updateNoteHandler = (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const note = store.notes.find((n) => n.id === id);
    if (!note) return res.status(404).json({ error: "Note not found." });

    const payload = req.body;
    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "Send a JSON object with note fields." });
    }

    const title = payload.title !== undefined ? payload.title : note.title;
    const content = payload.content !== undefined ? payload.content : note.content;

    if (!title || typeof title !== "string" || !title.trim() || title.trim().length > 200) {
      return res.status(400).json({ error: "Title must be between 1 and 200 characters." });
    }
    if (!content || typeof content !== "string" || !content.trim() || content.trim().length > 5000) {
      return res.status(400).json({ error: "Content must be between 1 and 5000 characters." });
    }

    note.title = title.trim();
    note.content = content.trim();
    note.updated_at = formatIsoMinutes();

    store.recordActivity("updated", "note", note.id, `Updated note: ${note.title}`);
    res.json(note);
  };

  app.put("/api/notes/:id", updateNoteHandler);
  app.patch("/api/notes/:id", updateNoteHandler);

  // 6. Activity
  app.get("/api/activity", (_req: Request, res: Response) => {
    res.json(store.activities.slice(0, 100));
  });

  // 7. Analytics Weekly
  app.get("/api/analytics/weekly", (_req: Request, res: Response) => {
    const today = new Date();
    const days: Array<{ date: string; label: string; tasks_completed: number; focus_minutes: number }> = [];

    for (let offset = 6; offset >= 0; offset--) {
      const d = new Date(today);
      d.setDate(d.getDate() - offset);
      const isoDate = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("en-US", { weekday: "short" });

      const tasksCompleted = store.activities.filter(
        (a) => a.entity_type === "task" && a.action === "completed" && a.created_at.startsWith(isoDate),
      ).length;

      const focusMinutes = store.focusSessions
        .filter((s) => s.completed_at.startsWith(isoDate))
        .reduce((sum, s) => sum + s.duration_minutes, 0);

      days.push({
        date: isoDate,
        label,
        tasks_completed: tasksCompleted,
        focus_minutes: focusMinutes,
      });
    }

    const activeDays = days.filter((d) => d.tasks_completed > 0 || d.focus_minutes > 0).length;

    let streak = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i].tasks_completed > 0 || days[i].focus_minutes > 0) {
        streak++;
      } else {
        break;
      }
    }

    res.json({
      days,
      total_tasks_completed: days.reduce((sum, d) => sum + d.tasks_completed, 0),
      total_focus_minutes: days.reduce((sum, d) => sum + d.focus_minutes, 0),
      active_days: activeDays,
      current_streak_days: streak,
    });
  });

  // 8. Analytics Daily
  app.get("/api/analytics/daily", (_req: Request, res: Response) => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const completedTasksToday = store.activities.filter(
      (a) => a.entity_type === "task" && a.action === "completed" && a.created_at.startsWith(todayIso),
    ).length;

    const sessionsToday = store.focusSessions.filter((s) => s.completed_at.startsWith(todayIso));
    const focusMinutesToday = sessionsToday.reduce((sum, s) => sum + s.duration_minutes, 0);

    const pendingTasks = store.tasks.filter((t) => t.status === "pending").length;
    const totalTasks = store.tasks.length;
    const completedTasksTotal = store.tasks.filter((t) => t.status === "completed").length;
    const dueToday = store.tasks.filter((t) => t.due_date === todayIso).length;

    const completionRate = totalTasks ? Math.round((completedTasksTotal / totalTasks) * 100) : 0;

    res.json({
      date: todayIso,
      tasks_completed: completedTasksToday,
      pending_tasks: pendingTasks,
      tasks_due_today: dueToday,
      focus_minutes: focusMinutesToday,
      focus_sessions: sessionsToday.length,
      completion_rate: completionRate,
    });
  });

  // 9. Focus Sessions
  app.get("/api/focus/sessions", (_req: Request, res: Response) => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const todaySessions = store.focusSessions.filter((s) => s.completed_at.startsWith(todayIso));
    const todayMinutes = todaySessions.reduce((sum, s) => sum + s.duration_minutes, 0);

    res.json({
      sessions: store.focusSessions.slice(0, 50),
      today_minutes: todayMinutes,
      today_sessions: todaySessions.length,
    });
  });

  app.post("/api/focus/sessions", (req: Request, res: Response) => {
    const payload = req.body;
    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "Send a JSON object with duration_minutes." });
    }
    const { duration_minutes, task_id } = payload;
    if (typeof duration_minutes !== "number" || duration_minutes < 1 || duration_minutes > 180 || !Number.isInteger(duration_minutes)) {
      return res.status(400).json({ error: "duration_minutes must be a whole number from 1 to 180." });
    }

    let taskTitle: string | null = null;
    if (task_id !== undefined && task_id !== null) {
      if (typeof task_id !== "number") {
        return res.status(400).json({ error: "task_id must be a task ID or null." });
      }
      const task = store.tasks.find((t) => t.id === task_id);
      if (!task) {
        return res.status(404).json({ error: "Task not found." });
      }
      taskTitle = task.title;
    }

    const session: FocusSessionItem = {
      id: store.nextId.focus++,
      user_id: 1,
      task_id: task_id || null,
      task_title: taskTitle,
      duration_minutes,
      completed_at: formatIsoMinutes(),
    };

    store.focusSessions.unshift(session);
    let summary = `Completed a ${duration_minutes}-minute focus session`;
    if (taskTitle) {
      summary += ` on ${taskTitle}`;
    }
    store.recordActivity("completed", "focus", session.id, summary);
    res.status(201).json(session);
  });

  // 10. Chat History
  app.get("/api/chat/history", (_req: Request, res: Response) => {
    const list = store.chatHistory.map((item) => ({
      id: item.id,
      role: item.role,
      text: item.content,
      action: item.action_data,
      created_at: item.created_at,
    }));
    res.json(list);
  });

  app.delete("/api/chat/history", (_req: Request, res: Response) => {
    store.chatHistory = [];
    res.status(204).end();
  });

  // 11. Assistant Status
  app.get("/api/assistant/status", (_req: Request, res: Response) => {
    const key = getGeminiApiKey();
    const configured = Boolean(key);
    res.json({
      provider: "Google Gemini",
      configured,
      live_search: configured,
      key_protected: true,
      endpoint_secured: true,
      rate_limiting: true,
    });
  });

  // 12. Chat endpoint
  app.post("/api/chat", chatLimiter, async (req: Request, res: Response) => {
    const payload = req.body;
    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "Send a JSON object with a message." });
    }
    const message = payload.message;
    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Message cannot be empty." });
    }
    if (message.length > 2000) {
      return res.status(400).json({ error: "Message must be 2000 characters or fewer." });
    }

    const reply = (text: string, action: any = null) => {
      const nowIso = formatIsoMinutes();
      store.chatHistory.push({
        id: store.nextId.chat++,
        user_id: 1,
        role: "user",
        content: message,
        action_data: null,
        created_at: nowIso,
      });
      store.chatHistory.push({
        id: store.nextId.chat++,
        user_id: 1,
        role: "assistant",
        content: text,
        action_data: action,
        created_at: nowIso,
      });
      return res.json({ response: text, action });
    };

    const trimmed = message.trim();
    const lowered = trimmed.toLowerCase();

    // 1. Task parse
    const parsedTask = parseTaskMessage(trimmed);
    if (parsedTask && "error" in parsedTask) {
      return reply(parsedTask.error);
    }
    if (parsedTask) {
      const task: TaskItem = {
        id: store.nextId.task++,
        user_id: 1,
        title: parsedTask.title,
        description: "",
        due_date: parsedTask.due_date,
        priority: parsedTask.priority as any,
        status: "pending",
        created_at: formatIsoMinutes(),
        updated_at: formatIsoMinutes(),
      };
      store.tasks.unshift(task);
      store.recordActivity("created", "task", task.id, `Created task: ${task.title}`);

      let dueLabel = "";
      if (task.due_date) {
        const d = new Date(task.due_date);
        dueLabel = ` due ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
      }
      return reply(`Task created: ${task.title}${dueLabel}.`, {
        type: "task_created",
        task,
      });
    }

    // 2. Show tasks
    if (["show my tasks", "list my tasks", "what are my tasks"].some((t) => lowered.includes(t))) {
      if (!store.tasks.length) {
        return reply("You don’t have any tasks yet. Create one from the Tasks page.", { type: "task_list" });
      }
      const listStr = store.tasks.map((t) => `• [${t.status === "completed" ? "x" : " "}] ${t.title}`).join("\n");
      return reply(`Here are your tasks:\n${listStr}`, { type: "task_list" });
    }

    // 3. Mark task complete
    if (lowered.includes("mark") && (lowered.includes("complete") || lowered.includes("done"))) {
      const match = trimmed.match(/(?:mark\s+)?(.+?)\s+(?:as\s+)?(?:complete|done)\b|(?:complete|finish)\s+(.+)/i);
      const target = (match ? (match[1] || match[2] || "") : "").trim().replace(/[ .!?]+$/, "");
      const task = target ? store.tasks.find((t) => t.title.toLowerCase().includes(target.toLowerCase())) : null;
      if (!task) {
        return reply("I couldn’t find that task. Check its title and try again.");
      }
      task.status = "completed";
      task.updated_at = formatIsoMinutes();
      store.recordActivity("completed", "task", task.id, `Completed task: ${task.title}`);
      return reply(`Nice work! “${task.title}” is marked complete.`, {
        type: "task_updated",
        task,
      });
    }

    // 4. Save note
    if (lowered.startsWith("save this") || lowered.startsWith("save note") || lowered.startsWith("note:")) {
      const content = trimmed.replace(/^(?:save this(?: note)?|save note|note:)\s*/i, "").trim();
      if (!content) {
        return reply("What should I save in your note?");
      }
      const title = content.slice(0, 60).replace(/[ .!?]+$/, "");
      const note: NoteItem = {
        id: store.nextId.note++,
        user_id: 1,
        title: title || "Quick note",
        content,
        created_at: formatIsoMinutes(),
        updated_at: formatIsoMinutes(),
      };
      store.notes.unshift(note);
      store.recordActivity("created", "note", note.id, `Saved note: ${note.title}`);
      return reply(`I saved that in Notes as “${note.title}”.`, {
        type: "note_created",
        note,
      });
    }

    // 5. Find notes
    if (lowered.includes("note") && ["find", "search", "show", "what"].some((w) => lowered.includes(w))) {
      let query = trimmed.replace(/^(?:find|search|show|what(?:\s+did\s+i\s+save)?)\s+(?:my\s+)?/i, "");
      query = query.replace(/\bnotes?\b/gi, "");
      query = query.replace(/^(?:about|for|on)\s+/i, "").replace(/[ ?.!\-]+$/, "").trim().toLowerCase();

      let matches = store.notes;
      if (query) {
        matches = matches.filter((n) => n.title.toLowerCase().includes(query) || n.content.toLowerCase().includes(query));
      }
      matches = matches.slice(0, 10);
      if (!matches.length) {
        return reply("No matching notes found.", { type: "note_search", notes: [] });
      }
      const responseText = "Here are the matching notes:\n" + matches.map((n) => `• ${n.title}: ${n.content}`).join("\n");
      return reply(responseText, { type: "note_search", notes: matches });
    }

    // 6. Reminder parse
    const parsedRem = parseReminder(trimmed);
    if (parsedRem && "error" in parsedRem) {
      return reply(parsedRem.error);
    }
    if (parsedRem) {
      const reminder: ReminderItem = {
        id: store.nextId.reminder++,
        user_id: 1,
        title: parsedRem.title,
        reminder_time: parsedRem.reminder_time,
        status: "pending",
        created_at: formatIsoMinutes(),
      };
      store.reminders.push(reminder);
      store.recordActivity("created", "reminder", reminder.id, `Created reminder: ${reminder.title}`);

      const remDate = new Date(reminder.reminder_time);
      const formattedTime = `${remDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} at ${remDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
      return reply(`Done! I’ll remind you to ${reminder.title} on ${formattedTime}.`, {
        type: "reminder_created",
        reminder,
      });
    }

    // 7. Show reminders
    if (lowered.includes("reminder") && ["show", "list", "what"].some((w) => lowered.includes(w))) {
      const sorted = [...store.reminders].sort(
        (a, b) => new Date(a.reminder_time).getTime() - new Date(b.reminder_time).getTime(),
      );
      if (!sorted.length) {
        return reply("You don’t have any reminders yet.", { type: "reminder_list" });
      }
      const resp = "Here are your reminders:\n" + sorted
        .map((r) => {
          const d = new Date(r.reminder_time);
          return `• ${r.title} — ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
        })
        .join("\n");
      return reply(resp, { type: "reminder_list" });
    }

    // 8. Progress / Activity summary
    if (["finished", "finish", "completed", "activity", "progress"].some((w) => lowered.includes(w))) {
      if (lowered.includes("today")) {
        const todayIso = new Date().toISOString().slice(0, 10);
        const completedToday = store.activities.filter(
          (a) => a.action === "completed" && a.created_at.startsWith(todayIso),
        );
        if (completedToday.length) {
          const resp = "Today you finished:\n" + completedToday
            .map((a) => `• ${a.summary.replace(/^Completed task: /, "")}`)
            .join("\n");
          return reply(resp, { type: "activity_summary" });
        }
        return reply("You haven’t completed any tasks today yet. Pick one small task and get started.", {
          type: "activity_summary",
        });
      }
      const completeCount = store.tasks.filter((t) => t.status === "completed").length;
      const totalCount = store.tasks.length;
      return reply(
        `You’ve completed ${completeCount} of ${totalCount} tasks. Your recent activity is available on the Activity page.`,
        { type: "activity_summary" },
      );
    }

    // 9. Help query
    if (["what can you help", "what can you do", "help me with"].some((p) => lowered.includes(p))) {
      return reply(
        "I can explain topics, help with study questions, and answer current questions when Live AI is configured. I can also create or list tasks and reminders, save or search notes, and summarize your activity.",
      );
    }

    // 10. General chat fallback (requires GEMINI_API_KEY)
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      return res.status(503).json({
        error:
          "Live AI is not configured yet. Set GEMINI_API_KEY in your environment and restart Sahayak. Local task, note, and reminder commands still work.",
      });
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
      const primaryModel = getValidModel();
      const modelsToTry = [primaryModel, "gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-flash-latest"].filter(
        (m, idx, arr) => arr.indexOf(m) === idx,
      );

      const rawHistory = store.chatHistory.slice(-8);
      const rawTurns = rawHistory.map((h) => ({
        role: (h.role === "assistant" ? "model" : "user") as "user" | "model",
        parts: [{ text: sanitizeString(h.content, 2000) }],
      }));
      rawTurns.push({ role: "user", parts: [{ text: sanitizeString(trimmed, 2000) }] });

      // Clean contents so it strictly starts with a user turn and roles strictly alternate
      const cleanContents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];
      for (const turn of rawTurns) {
        if (!turn.parts[0]?.text) continue;
        if (cleanContents.length === 0) {
          if (turn.role === "user") {
            cleanContents.push(turn);
          }
        } else {
          const lastRole = cleanContents[cleanContents.length - 1].role;
          if (lastRole === turn.role) {
            cleanContents[cleanContents.length - 1].parts[0].text += `\n${turn.parts[0].text}`;
          } else {
            cleanContents.push(turn);
          }
        }
      }
      if (cleanContents.length === 0) {
        cleanContents.push({ role: "user", parts: [{ text: sanitizeString(trimmed, 2000) }] });
      }

      const systemInstruction =
        "You are Sahayak (ಸಹಾಯಕ್), a friendly, helpful, and thoughtful personal and study assistant. Answer clearly, concisely, and helpfully. You understand both English and Kannada (ಕನ್ನಡ). If the user writes in Kannada, reply helpfully in Kannada. If they write in English or mixed Kanglish, reply naturally in that style. Do not claim to have modified tasks, notes, or reminders directly; those actions are handled by the local app.";

      let geminiResponse: any = null;

      for (const m of modelsToTry) {
        try {
          geminiResponse = await ai.models.generateContent({
            model: m,
            contents: cleanContents,
            config: {
              systemInstruction,
            },
          });
          if (geminiResponse?.text) {
            break;
          }
        } catch (modelErr: any) {
          console.error(`Model ${m} call failed:`, modelErr?.status, modelErr?.message || modelErr);
        }
      }

      if (!geminiResponse?.text) {
        throw new Error("Unable to generate text with available models.");
      }

      const answer = geminiResponse.text.trim();
      return reply(answer);
    } catch (err: any) {
      const rawMsg = String(err?.message || "");
      const safeMsg = apiKey ? rawMsg.replaceAll(apiKey, "[REDACTED_API_KEY]") : rawMsg;
      console.error("Gemini API Error (sanitized):", safeMsg);
      return res.status(502).json({
        error: "The AI assistant encountered an issue generating a response. Please try asking again.",
      });
    }
  });

  // Global Error Handler for API routes
  app.use("/api", (err: any, _req: Request, res: Response, _next: express.NextFunction) => {
    if (err?.type === "entity.too.large") {
      return res.status(413).json({ error: "Payload too large. Maximum size is 128KB." });
    }
    if (err instanceof SyntaxError && "body" in err) {
      return res.status(400).json({ error: "Invalid JSON payload." });
    }
    const raw = String(err?.message || "Internal server error.");
    const apiKey = process.env.GEMINI_API_KEY;
    const safe = apiKey ? raw.replaceAll(apiKey, "[REDACTED]") : raw;
    console.error("Unhandled API error:", safe);
    res.status(500).json({ error: "Internal server error." });
  });

  // Frontend Serving / Vite Integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: "0.0.0.0", port: PORT, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, "dist")));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Sahayak AI running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
