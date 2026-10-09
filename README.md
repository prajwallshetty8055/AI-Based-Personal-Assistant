<<<<<<< HEAD
# Sahayak AI

Sahayak is a local-first personal assistant prototype. Its responsive dashboard
and chat use a Flask API and SQLite as the source of truth for tasks, reminders,
notes, and activity.

## Run locally

From the project directory in PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe server.py
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Application data is stored
in `backend/sahayak.sqlite3`.

## Working in this prototype

- Dashboard counts and recent activity are loaded from the database.
- The dashboard includes a live clock, due-today and pending task lists, daily
  productivity metrics, upcoming reminders, and quick-save note/reminder forms.
- Current weather can be loaded for a city entered by the user. The city is sent
  to Open-Meteo for geocoding and weather data; device location is not accessed.
- Tasks support create, edit, complete/reopen, and delete.
- Reminders support create, edit, complete/reopen, and delete. They are scheduled
  for their saved local date/time; an in-app popup appears when they are due.
  Optional system notifications and repeating beep alarms also work while the
  app is open. Enable notification permission and the audible alarm in Settings;
  browsers require a click to unlock audio each time the app is opened.
- The top-bar theme control switches between dark and light mode and remembers
  the selected theme on this device.
- Notes support create, edit, delete, and search.
- Focus timer supports 15-, 25-, and 50-minute task-linked sprints, pause/resume,
  a five-minute break, and a countdown that survives page reloads. Completed
  sprints are stored in SQLite and appear in activity and session history.
- Activity includes a rolling seven-day productivity summary with task
  completions, focus minutes, active days, and a current streak.
- Chat messages and assistant actions persist in SQLite; `Clear conversation`
  removes the saved transcript.
- Chat requests are sent to `POST /api/chat`.
- Local natural-language intents create/list/complete tasks, create/list
  reminders, save/search notes, and summarize completed work. These changes are
  validated by Flask and saved in SQLite.
- General questions use Google Gemini with Google Search grounding when
  `GEMINI_API_KEY` is configured. Answers can include clickable web sources.
  Questions and the recent chat context are sent to Google; the integration uses
  stateless requests. Local task, note, and reminder commands do not need the AI
  provider.
- Configure Live AI in PowerShell before starting the server:

  ```powershell
  $env:GEMINI_API_KEY = "your-Gemini-API-key"
  .\.venv\Scripts\python.exe server.py
  ```

  The default model is `gemini-3.8-flash`; set `GEMINI_MODEL` to override it.
  The key stays in the server environment and is never returned by the status
  endpoint or sent to the browser.
- Browser speech recognition and speech synthesis are available where supported.
- `GET /api/health` reports whether the API is available.
- `GET /api/assistant/status` reports whether Live AI is configured.

Main API routes:

- `GET /api/dashboard`
- `GET|POST /api/tasks`, `GET|PUT|PATCH|DELETE /api/tasks/<id>`
- `GET|POST /api/reminders`, `GET|PUT|PATCH|DELETE /api/reminders/<id>`
- `GET /api/notes?q=...`, `POST /api/notes`,
  `GET|PUT|PATCH|DELETE /api/notes/<id>`
- `GET /api/activity`
- `GET /api/analytics/daily`
- `GET /api/analytics/weekly`
- `GET|POST /api/focus/sessions` (POST a completed session with
  `{"duration_minutes":25,"task_id":1}`; `task_id` may be null)
- `GET|DELETE /api/chat/history`
- `GET /api/assistant/status`
- `POST /api/chat` with `{"message":"..."}`.

Natural-language date/time and intent parsing are intentionally limited
prototypes for local task/reminder actions, not a general language model or
production scheduler. General chat is powered by a pretrained Gemini model; this
project does not fine-tune or train its own model. Search grounding improves
freshness but does not guarantee correctness, so verify important details.
Reminder
delivery depends on the browser keeping this page open; background-tab or
operating-system power throttling can delay a browser timer. This is not a
replacement for a native alarm app when timing is critical.

## Current scope

This is still a single-user local prototype: authentication and multi-user
isolation are not implemented. Study planning and production deployment are not
implemented yet.

## Tests

```powershell
.\.venv\Scripts\python.exe -m unittest backend.test_app
```
=======
# AI-Based-Personal-Assistant
>>>>>>> 071d3f073ef544c4db0b7bab2c1d2bbd7a82b7ad
