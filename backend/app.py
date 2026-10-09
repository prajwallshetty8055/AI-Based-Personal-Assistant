import json
import os
import re
from datetime import date, datetime, time, timedelta
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from flask import Flask, jsonify, request, send_from_directory
from flask_sqlalchemy import SQLAlchemy


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATABASE_PATH = Path(__file__).resolve().parent / "sahayak.sqlite3"
db = SQLAlchemy()


class Reminder(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=False, default=1, index=True)
    title = db.Column(db.String(200), nullable=False)
    reminder_time = db.Column(db.DateTime, nullable=False, index=True)
    status = db.Column(db.String(20), nullable=False, default="pending")
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.now)

    def as_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "reminder_time": self.reminder_time.isoformat(timespec="seconds"),
            "status": self.status,
        }


class Task(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=False, default=1, index=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.String(1000), nullable=False, default="")
    due_date = db.Column(db.Date, nullable=True)
    priority = db.Column(db.String(20), nullable=False, default="medium")
    status = db.Column(db.String(20), nullable=False, default="pending")
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.now)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=datetime.now, onupdate=datetime.now
    )

    def as_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "due_date": self.due_date.isoformat() if self.due_date else None,
            "priority": self.priority,
            "status": self.status,
            "created_at": self.created_at.isoformat(timespec="minutes"),
            "updated_at": self.updated_at.isoformat(timespec="minutes"),
        }


class Note(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=False, default=1, index=True)
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.String(5000), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.now)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=datetime.now, onupdate=datetime.now
    )

    def as_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "content": self.content,
            "created_at": self.created_at.isoformat(timespec="minutes"),
            "updated_at": self.updated_at.isoformat(timespec="minutes"),
        }


class Activity(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=False, default=1, index=True)
    action = db.Column(db.String(60), nullable=False)
    entity_type = db.Column(db.String(30), nullable=False)
    entity_id = db.Column(db.Integer, nullable=True)
    summary = db.Column(db.String(300), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.now, index=True)

    def as_dict(self):
        return {
            "id": self.id,
            "action": self.action,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "summary": self.summary,
            "created_at": self.created_at.isoformat(timespec="minutes"),
        }


class ChatHistory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=False, default=1, index=True)
    role = db.Column(db.String(20), nullable=False)
    content = db.Column(db.String(2000), nullable=False)
    action_data = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.now, index=True)

    def as_dict(self):
        return {
            "id": self.id,
            "role": self.role,
            "text": self.content,
            "action": json.loads(self.action_data) if self.action_data else None,
            "created_at": self.created_at.isoformat(timespec="minutes"),
        }


class FocusSession(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=False, default=1, index=True)
    task_id = db.Column(
        db.Integer, db.ForeignKey("task.id", ondelete="SET NULL"), nullable=True, index=True
    )
    duration_minutes = db.Column(db.Integer, nullable=False)
    completed_at = db.Column(db.DateTime, nullable=False, default=datetime.now, index=True)
    task = db.relationship("Task")

    def as_dict(self):
        return {
            "id": self.id,
            "task_id": self.task_id,
            "task_title": self.task.title if self.task else None,
            "duration_minutes": self.duration_minutes,
            "completed_at": self.completed_at.isoformat(timespec="minutes"),
        }


def record_activity(action, entity_type, entity_id, summary):
    db.session.add(
        Activity(
            user_id=1,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            summary=summary[:300],
        )
    )


def generate_grounded_answer(api_key, model, message, history):
    endpoint = "https://generativelanguage.googleapis.com/v1beta/interactions"
    conversation = [
        f"{'Assistant' if item['role'] == 'model' else 'User'}: {item['content']}"
        for item in history
        if item["role"] in ("user", "model")
    ]
    conversation.append(f"User: {message}")
    body = {
        "model": model,
        "input": "\n\n".join(conversation),
        "system_instruction": (
            "You are Sahayak, a helpful personal and study assistant. Answer clearly "
            "and use Google Search grounding for questions about current or changing "
            "facts. Distinguish verified facts from uncertainty. Do not claim to have "
            "changed tasks, notes, or reminders; those actions are handled by the local app."
        ),
        "tools": [{"type": "google_search"}],
        "store": False,
    }
    http_request = Request(
        endpoint,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
        method="POST",
    )
    try:
        with urlopen(http_request, timeout=30) as response:
            provider_data = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        raise RuntimeError("The AI provider rejected the request. Check the API key and model.") from exc
    except (URLError, TimeoutError) as exc:
        raise RuntimeError("The AI provider could not be reached. Check your connection and try again.") from exc
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeError("The AI provider returned an unreadable response.") from exc

    output_parts = [
        part
        for step in provider_data.get("steps", [])
        if isinstance(step, dict) and step.get("type") == "model_output"
        for part in step.get("content", [])
        if isinstance(part, dict) and part.get("type") == "text"
    ]
    answer = "\n".join(
        part["text"].strip()
        for part in output_parts
        if isinstance(part.get("text"), str) and part["text"].strip()
    ) or provider_data.get("output_text", "")
    if not answer:
        raise RuntimeError("The AI provider did not return an answer. Please try rephrasing.")

    sources = []
    seen_urls = set()
    for annotation in (
        annotation
        for part in output_parts
        for annotation in part.get("annotations", [])
        if isinstance(annotation, dict) and annotation.get("type") == "url_citation"
    ):
        url = annotation.get("url")
        title = annotation.get("title")
        if (
            isinstance(url, str)
            and url.startswith(("https://", "http://"))
            and url not in seen_urls
        ):
            sources.append({"title": title if isinstance(title, str) and title else url, "url": url})
            seen_urls.add(url)
        if len(sources) == 5:
            break
    return answer, sources


def parse_date(value):
    if value is None or value == "":
        return None
    if not isinstance(value, str):
        raise ValueError("Date must be an ISO date.")
    return date.fromisoformat(value)


def task_payload(payload):
    if not isinstance(payload, dict):
        raise ValueError("Send a JSON object.")
    title = payload.get("title")
    if not isinstance(title, str) or not title.strip() or len(title.strip()) > 200:
        raise ValueError("Title must be between 1 and 200 characters.")
    description = payload.get("description", "")
    if not isinstance(description, str) or len(description) > 1000:
        raise ValueError("Description must be 1000 characters or fewer.")
    priority = payload.get("priority", "medium")
    if priority not in ("low", "medium", "high"):
        raise ValueError("Priority must be low, medium, or high.")
    status = payload.get("status", "pending")
    if status not in ("pending", "completed"):
        raise ValueError("Status must be pending or completed.")
    try:
        due_date = parse_date(payload.get("due_date"))
    except ValueError as exc:
        raise ValueError("due_date must be an ISO date (YYYY-MM-DD).") from exc
    return {
        "title": title.strip(),
        "description": description.strip(),
        "priority": priority,
        "status": status,
        "due_date": due_date,
    }


def parse_task_message(message, now=None):
    normalized = re.sub(r"\s+", " ", message.strip())
    lowered = normalized.lower()
    if not any(
        phrase in lowered
        for phrase in ("create a task", "add a task", "add task", "create task", "i need to", "i have to", "todo:")
    ):
        return None

    due_date = None
    if re.search(r"\btomorrow\b|\bnale\b", lowered):
        due_date = (now or datetime.now()).date() + timedelta(days=1)
    elif re.search(r"\btoday\b|\bivattu\b", lowered):
        due_date = (now or datetime.now()).date()
    elif re.search(r"\bnext week\b", lowered):
        due_date = (now or datetime.now()).date() + timedelta(days=7)

    title = re.sub(
        r"^(?:please\s+)?(?:create|add)\s+(?:a\s+)?task\s+(?:to\s+)?|"
        r"^(?:i need to|i have to|todo:)\s*",
        "",
        normalized,
        flags=re.IGNORECASE,
    )
    title = re.sub(r"\b(?:by|due)\s+(?:tomorrow|today|next week)\b", "", title, flags=re.IGNORECASE)
    title = re.sub(
        r"\b(?:tomorrow|today|next week|nale|ivattu|morning|afternoon|evening|night)\b",
        "",
        title,
        flags=re.IGNORECASE,
    )
    title = re.sub(r"\s+", " ", title).strip(" .,!?:;-'\"“”")
    if not title:
        return {"error": "What should I call the task?"}
    priority = "high" if re.search(r"\b(high|urgent|important)\b", lowered) else (
        "low" if re.search(r"\b(low|when i can)\b", lowered) else "medium"
    )
    title = re.sub(r"\b(?:high|urgent|important|low|medium)\s+priority\b|\b(?:high|urgent|important)\b", "", title, flags=re.IGNORECASE)
    return {"title": title[:200].strip(), "due_date": due_date, "priority": priority}


def parse_reminder(message, now=None):
    """Parse the initial supported English and Kannada-English reminder phrases."""
    current = now or datetime.now()
    normalized = re.sub(r"\s+", " ", message.strip().lower())

    if not any(
        phrase in normalized
        for phrase in ("remind", "reminder", "hakko", "ನೆನಪಿಸು")
    ):
        return None

    if "tomorrow" in normalized or re.search(r"\bnale\b", normalized):
        reminder_date = current.date() + timedelta(days=1)
    elif "today" in normalized or re.search(r"\bivattu\b", normalized):
        reminder_date = current.date()
    else:
        return {"error": "When should I remind you? Try “tomorrow at 7 PM”."}

    time_match = re.search(
        r"\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b"
        r"(?:\s*(gantge|o'clock))?",
        normalized,
    )
    if not time_match:
        return {"error": "What time should I set? For example, “at 7 PM”."}

    hour = int(time_match.group(1))
    minute = int(time_match.group(2) or 0)
    meridiem = time_match.group(3)
    time_context = normalized[max(0, time_match.start() - 14) : time_match.start()]
    if meridiem:
        if hour < 1 or hour > 12:
            return {"error": "That time does not look valid. Please include a time like 7 PM."}
        hour = hour % 12 + (12 if meridiem == "pm" else 0)
    elif "evening" in time_context or "night" in time_context:
        hour = (hour % 12) + 12
    elif "morning" in time_context:
        hour = hour % 12
    elif hour > 23:
        return {"error": "That time does not look valid. Please include a time like 7 PM."}

    if minute > 59:
        return {"error": "That time does not look valid. Please include a time like 7 PM."}

    title = message.strip()
    title = re.sub(
        r"^(?:please\s+)?(?:create\s+)?(?:a\s+)?(?:reminder\s+to|remind\s+me\s+to|"
        r"remind\s+me|reminder|set\s+(?:a\s+)?reminder\s+to)\s*",
        "",
        title,
        flags=re.IGNORECASE,
    )
    title = re.sub(r"\b(?:tomorrow|today|nale|ivattu)\b", " ", title, flags=re.IGNORECASE)
    title = re.sub(
        r"\b(?:at\s*)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?"
        r"(?:\s*(?:gantge|o'clock))?\b",
        " ",
        title,
        flags=re.IGNORECASE,
    )
    title = re.sub(r"\b(?:morning|afternoon|evening|night)\b", " ", title, flags=re.IGNORECASE)
    title = re.sub(r"\b(?:anta\s+)?(?:reminder\s+)?hakko\b", " ", title, flags=re.IGNORECASE)
    title = re.sub(r"\banta\b", " ", title, flags=re.IGNORECASE)
    title = re.sub(r"\s+", " ", title).strip(" .,!?:;-")
    title = re.sub(r"^(?:to|that)\s+", "", title, flags=re.IGNORECASE)
    if not title:
        return {"error": "What should I remind you about?"}

    return {
        "title": title[:200],
        "reminder_time": datetime.combine(
            reminder_date, time(hour=hour, minute=minute)
        ),
    }


def create_app(test_config=None):
    app = Flask(__name__, static_folder=None)
    app.config.update(
        SQLALCHEMY_DATABASE_URI=f"sqlite:///{DATABASE_PATH.as_posix()}",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        GEMINI_API_KEY=os.environ.get("GEMINI_API_KEY", ""),
        GEMINI_MODEL=os.environ.get("GEMINI_MODEL", "gemini-3.8-flash"),
        JSON_SORT_KEYS=False,
    )
    if test_config:
        app.config.update(test_config)

    db.init_app(app)
    with app.app_context():
        db.create_all()

    @app.get("/")
    def index():
        return send_from_directory(PROJECT_ROOT, "index.html")

    @app.get("/src/<path:filename>")
    def frontend_assets(filename):
        return send_from_directory(PROJECT_ROOT / "src", filename)

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok", "service": "Sahayak AI"})

    @app.get("/api/dashboard")
    def dashboard():
        tasks = Task.query.filter_by(user_id=1).order_by(Task.created_at.desc()).all()
        reminders = Reminder.query.filter_by(user_id=1).order_by(Reminder.reminder_time.asc()).all()
        activities = Activity.query.filter_by(user_id=1).order_by(Activity.created_at.desc()).limit(10).all()
        return jsonify(
            {
                "tasks": [item.as_dict() for item in tasks],
                "reminders": [item.as_dict() for item in reminders],
                "notes_count": Note.query.filter_by(user_id=1).count(),
                "activity": [item.as_dict() for item in activities],
                "stats": {
                    "tasks_total": len(tasks),
                    "tasks_completed": sum(item.status == "completed" for item in tasks),
                    "reminders_total": len(reminders),
                    "notes_total": Note.query.filter_by(user_id=1).count(),
                },
            }
        )

    @app.get("/api/tasks")
    def list_tasks():
        tasks = Task.query.filter_by(user_id=1).order_by(Task.created_at.desc()).all()
        return jsonify([item.as_dict() for item in tasks])

    @app.post("/api/tasks")
    def create_task():
        try:
            data = task_payload(request.get_json(silent=True))
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        task = Task(user_id=1, **data)
        db.session.add(task)
        db.session.flush()
        record_activity("created", "task", task.id, f"Created task: {task.title}")
        db.session.commit()
        return jsonify(task.as_dict()), 201

    @app.route("/api/tasks/<int:task_id>", methods=["GET", "PUT", "PATCH", "DELETE"])
    def task_detail(task_id):
        task = Task.query.filter_by(id=task_id, user_id=1).first()
        if task is None:
            return jsonify({"error": "Task not found."}), 404
        if request.method == "GET":
            return jsonify(task.as_dict())
        if request.method == "DELETE":
            summary = f"Deleted task: {task.title}"
            FocusSession.query.filter_by(task_id=task_id, user_id=1).update(
                {FocusSession.task_id: None},
                synchronize_session=False,
            )
            db.session.delete(task)
            record_activity("deleted", "task", task_id, summary)
            db.session.commit()
            return "", 204

        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"error": "Send a JSON object with task fields."}), 400
        merged = {
            "title": payload.get("title", task.title),
            "description": payload.get("description", task.description),
            "priority": payload.get("priority", task.priority),
            "status": payload.get("status", task.status),
            "due_date": payload.get(
                "due_date", task.due_date.isoformat() if task.due_date else None
            ),
        }
        try:
            data = task_payload(merged)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        previous_status = task.status
        for key, value in data.items():
            setattr(task, key, value)
        if previous_status != task.status and task.status == "completed":
            activity_action = "completed"
            summary = f"Completed task: {task.title}"
        elif previous_status != task.status:
            activity_action = "reopened"
            summary = f"Reopened task: {task.title}"
        else:
            activity_action = "updated"
            summary = f"Updated task: {task.title}"
        record_activity(activity_action, "task", task.id, summary)
        db.session.commit()
        return jsonify(task.as_dict())

    @app.get("/api/reminders")
    def list_reminders():
        reminders = (
            Reminder.query.filter_by(user_id=1)
            .order_by(Reminder.reminder_time.asc())
            .all()
        )
        return jsonify([reminder.as_dict() for reminder in reminders])

    @app.route(
        "/api/reminders/<int:reminder_id>",
        methods=["GET", "PUT", "PATCH", "DELETE"],
    )
    def reminder_detail(reminder_id):
        reminder = Reminder.query.filter_by(id=reminder_id, user_id=1).first()
        if reminder is None:
            return jsonify({"error": "Reminder not found."}), 404
        if request.method == "GET":
            return jsonify(reminder.as_dict())
        if request.method == "DELETE":
            summary = f"Deleted reminder: {reminder.title}"
            db.session.delete(reminder)
            record_activity("deleted", "reminder", reminder_id, summary)
            db.session.commit()
            return "", 204

        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"error": "Send a JSON object with reminder fields."}), 400
        title = payload.get("title", reminder.title)
        if not isinstance(title, str) or not title.strip() or len(title.strip()) > 200:
            return jsonify({"error": "Title must be between 1 and 200 characters."}), 400
        reminder_time = reminder.reminder_time
        if "reminder_time" in payload:
            try:
                reminder_time = datetime.fromisoformat(payload["reminder_time"])
            except (TypeError, ValueError):
                return jsonify({"error": "reminder_time must be an ISO date-time."}), 400
        status = payload.get("status", reminder.status)
        if status not in ("pending", "completed"):
            return jsonify({"error": "Status must be pending or completed."}), 400
        previous_status = reminder.status
        reminder.title = title.strip()
        reminder.reminder_time = reminder_time
        reminder.status = status
        if previous_status != reminder.status and reminder.status == "completed":
            activity_action = "completed"
            summary = f"Completed reminder: {reminder.title}"
        elif previous_status != reminder.status:
            activity_action = "reopened"
            summary = f"Reopened reminder: {reminder.title}"
        else:
            activity_action = "updated"
            summary = f"Updated reminder: {reminder.title}"
        record_activity(activity_action, "reminder", reminder.id, summary)
        db.session.commit()
        return jsonify(reminder.as_dict())

    @app.get("/api/notes")
    def list_notes():
        query = request.args.get("q", "").strip()
        notes = Note.query.filter_by(user_id=1)
        if query:
            pattern = f"%{query}%"
            notes = notes.filter(db.or_(Note.title.ilike(pattern), Note.content.ilike(pattern)))
        return jsonify([item.as_dict() for item in notes.order_by(Note.updated_at.desc()).all()])

    @app.post("/api/notes")
    def create_note():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"error": "Send a JSON object with title and content."}), 400
        title = payload.get("title")
        content = payload.get("content")
        if not isinstance(title, str) or not title.strip() or len(title.strip()) > 200:
            return jsonify({"error": "Title must be between 1 and 200 characters."}), 400
        if not isinstance(content, str) or not content.strip() or len(content.strip()) > 5000:
            return jsonify({"error": "Content must be between 1 and 5000 characters."}), 400
        note = Note(user_id=1, title=title.strip(), content=content.strip())
        db.session.add(note)
        db.session.flush()
        record_activity("created", "note", note.id, f"Saved note: {note.title}")
        db.session.commit()
        return jsonify(note.as_dict()), 201

    @app.route("/api/notes/<int:note_id>", methods=["GET", "PUT", "PATCH", "DELETE"])
    def note_detail(note_id):
        note = Note.query.filter_by(id=note_id, user_id=1).first()
        if note is None:
            return jsonify({"error": "Note not found."}), 404
        if request.method == "GET":
            return jsonify(note.as_dict())
        if request.method == "DELETE":
            summary = f"Deleted note: {note.title}"
            db.session.delete(note)
            record_activity("deleted", "note", note_id, summary)
            db.session.commit()
            return "", 204
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"error": "Send a JSON object with note fields."}), 400
        title = payload.get("title", note.title)
        content = payload.get("content", note.content)
        if not isinstance(title, str) or not title.strip() or len(title.strip()) > 200:
            return jsonify({"error": "Title must be between 1 and 200 characters."}), 400
        if not isinstance(content, str) or not content.strip() or len(content.strip()) > 5000:
            return jsonify({"error": "Content must be between 1 and 5000 characters."}), 400
        note.title = title.strip()
        note.content = content.strip()
        record_activity("updated", "note", note.id, f"Updated note: {note.title}")
        db.session.commit()
        return jsonify(note.as_dict())

    @app.get("/api/activity")
    def list_activity():
        activities = Activity.query.filter_by(user_id=1).order_by(Activity.created_at.desc()).limit(100).all()
        return jsonify([item.as_dict() for item in activities])

    @app.get("/api/analytics/weekly")
    def weekly_analytics():
        today = datetime.now().date()
        first_day = today - timedelta(days=6)
        start = datetime.combine(first_day, time.min)
        end = datetime.combine(today + timedelta(days=1), time.min)
        task_activity = Activity.query.filter(
            Activity.user_id == 1,
            Activity.entity_type == "task",
            Activity.action == "completed",
            Activity.created_at >= start,
            Activity.created_at < end,
        ).all()
        focus_sessions = FocusSession.query.filter(
            FocusSession.user_id == 1,
            FocusSession.completed_at >= start,
            FocusSession.completed_at < end,
        ).all()
        days = {
            first_day + timedelta(days=offset): {
                "date": (first_day + timedelta(days=offset)).isoformat(),
                "label": (first_day + timedelta(days=offset)).strftime("%a"),
                "tasks_completed": 0,
                "focus_minutes": 0,
            }
            for offset in range(7)
        }
        for item in task_activity:
            day = item.created_at.date()
            days[day]["tasks_completed"] += 1
        for session in focus_sessions:
            day = session.completed_at.date()
            days[day]["focus_minutes"] += session.duration_minutes

        daily = list(days.values())
        active_dates = {
            date.fromisoformat(item["date"])
            for item in daily
            if item["tasks_completed"] or item["focus_minutes"]
        }
        streak = 0
        day = today
        while day in active_dates:
            streak += 1
            day -= timedelta(days=1)
        return jsonify(
            {
                "days": daily,
                "total_tasks_completed": sum(item["tasks_completed"] for item in daily),
                "total_focus_minutes": sum(item["focus_minutes"] for item in daily),
                "active_days": len(active_dates),
                "current_streak_days": streak,
            }
        )

    @app.get("/api/analytics/daily")
    def daily_analytics():
        today = datetime.now().date()
        start = datetime.combine(today, time.min)
        end = start + timedelta(days=1)
        completed_tasks = Activity.query.filter(
            Activity.user_id == 1,
            Activity.entity_type == "task",
            Activity.action == "completed",
            Activity.created_at >= start,
            Activity.created_at < end,
        ).count()
        sessions = FocusSession.query.filter(
            FocusSession.user_id == 1,
            FocusSession.completed_at >= start,
            FocusSession.completed_at < end,
        ).all()
        pending_tasks = Task.query.filter_by(user_id=1, status="pending").count()
        total_tasks = Task.query.filter_by(user_id=1).count()
        completed_tasks_total = Task.query.filter_by(user_id=1, status="completed").count()
        due_today = Task.query.filter_by(user_id=1, due_date=today).count()
        return jsonify(
            {
                "date": today.isoformat(),
                "tasks_completed": completed_tasks,
                "pending_tasks": pending_tasks,
                "tasks_due_today": due_today,
                "focus_minutes": sum(session.duration_minutes for session in sessions),
                "focus_sessions": len(sessions),
                "completion_rate": round(
                    completed_tasks_total / total_tasks * 100
                )
                if total_tasks
                else 0,
            }
        )

    @app.get("/api/focus/sessions")
    def list_focus_sessions():
        sessions = (
            FocusSession.query.filter_by(user_id=1)
            .order_by(FocusSession.completed_at.desc())
            .limit(50)
            .all()
        )
        today_start = datetime.combine(datetime.now().date(), time.min)
        completed_today = FocusSession.query.filter(
            FocusSession.user_id == 1,
            FocusSession.completed_at >= today_start,
        ).all()
        return jsonify(
            {
                "sessions": [item.as_dict() for item in sessions],
                "today_minutes": sum(item.duration_minutes for item in completed_today),
                "today_sessions": len(completed_today),
            }
        )

    @app.post("/api/focus/sessions")
    def create_focus_session():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"error": "Send a JSON object with duration_minutes."}), 400
        duration = payload.get("duration_minutes")
        if isinstance(duration, bool) or not isinstance(duration, int) or not 1 <= duration <= 180:
            return jsonify({"error": "duration_minutes must be a whole number from 1 to 180."}), 400
        task_id = payload.get("task_id")
        if task_id is not None:
            if isinstance(task_id, bool) or not isinstance(task_id, int):
                return jsonify({"error": "task_id must be a task ID or null."}), 400
            task = Task.query.filter_by(id=task_id, user_id=1).first()
            if task is None:
                return jsonify({"error": "Task not found."}), 404
        session = FocusSession(
            user_id=1,
            task_id=task_id,
            duration_minutes=duration,
        )
        db.session.add(session)
        db.session.flush()
        summary = f"Completed a {duration}-minute focus session"
        if task_id is not None:
            summary += f" on {task.title}"
        record_activity("completed", "focus", session.id, summary)
        db.session.commit()
        return jsonify(session.as_dict()), 201

    @app.route("/api/chat/history", methods=["GET", "DELETE"])
    def chat_history():
        if request.method == "DELETE":
            ChatHistory.query.filter_by(user_id=1).delete()
            db.session.commit()
            return "", 204
        messages = (
            ChatHistory.query.filter_by(user_id=1)
            .order_by(ChatHistory.created_at.asc(), ChatHistory.id.asc())
            .all()
        )
        return jsonify([item.as_dict() for item in messages])

    @app.get("/api/assistant/status")
    def assistant_status():
        configured = bool(app.config.get("GEMINI_API_KEY"))
        return jsonify(
            {
                "provider": "Google Gemini",
                "configured": configured,
                "live_search": configured,
            }
        )

    @app.post("/api/chat")
    def chat():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"error": "Send a JSON object with a message."}), 400
        message = payload.get("message")
        if not isinstance(message, str) or not message.strip():
            return jsonify({"error": "Message cannot be empty."}), 400
        if len(message) > 2000:
            return jsonify({"error": "Message must be 2000 characters or fewer."}), 400

        def reply(text, action=None):
            db.session.add(ChatHistory(user_id=1, role="user", content=message))
            db.session.add(
                ChatHistory(
                    user_id=1,
                    role="assistant",
                    content=text,
                    action_data=json.dumps(action) if action else None,
                )
            )
            db.session.commit()
            return jsonify({"response": text, "action": action})

        lowered = message.lower()
        parsed_task = parse_task_message(message)
        if parsed_task and "error" in parsed_task:
            return reply(parsed_task["error"])
        if parsed_task:
            task = Task(
                user_id=1,
                title=parsed_task["title"],
                due_date=parsed_task["due_date"],
                priority=parsed_task["priority"],
            )
            db.session.add(task)
            db.session.flush()
            record_activity("created", "task", task.id, f"Created task: {task.title}")
            due_label = f" due {task.due_date.strftime('%b')} {task.due_date.day}" if task.due_date else ""
            return reply(
                f"Task created: {task.title}{due_label}.",
                {"type": "task_created", "task": task.as_dict()},
            )

        if any(term in lowered for term in ("show my tasks", "list my tasks", "what are my tasks")):
            tasks = Task.query.filter_by(user_id=1).order_by(Task.created_at.desc()).all()
            if not tasks:
                response = "You don’t have any tasks yet. Create one from the Tasks page."
            else:
                response = "Here are your tasks:\n" + "\n".join(
                    f"• [{'x' if item.status == 'completed' else ' '}] {item.title}"
                    for item in tasks
                )
            return reply(response, {"type": "task_list"})

        if "mark" in lowered and ("complete" in lowered or "done" in lowered):
            target_match = re.search(
                r"(?:mark\s+)?(.+?)\s+(?:as\s+)?(?:complete|done)\b|"
                r"(?:complete|finish)\s+(.+)",
                message,
                flags=re.IGNORECASE,
            )
            target = next((part for part in target_match.groups() if part), "").strip(" .!?") if target_match else ""
            task = Task.query.filter_by(user_id=1).filter(Task.title.ilike(f"%{target}%")).first() if target else None
            if task is None:
                return reply("I couldn’t find that task. Check its title and try again.")
            task.status = "completed"
            record_activity("completed", "task", task.id, f"Completed task: {task.title}")
            return reply(
                f"Nice work! “{task.title}” is marked complete.",
                {"type": "task_updated", "task": task.as_dict()},
            )

        if lowered.startswith("save this") or lowered.startswith("save note") or lowered.startswith("note:"):
            content = re.sub(r"^(?:save this(?: note)?|save note|note:)\s*", "", message, flags=re.IGNORECASE).strip()
            if not content:
                return reply("What should I save in your note?")
            title = content[:60].rstrip(" .!?")
            note = Note(user_id=1, title=title or "Quick note", content=content)
            db.session.add(note)
            db.session.flush()
            record_activity("created", "note", note.id, f"Saved note: {note.title}")
            return reply(
                f"I saved that in Notes as “{note.title}”.",
                {"type": "note_created", "note": note.as_dict()},
            )

        if "note" in lowered and any(word in lowered for word in ("find", "search", "show", "what")):
            query = re.sub(
                r"^(?:find|search|show|what(?:\s+did\s+i\s+save)?)\s+(?:my\s+)?",
                "",
                message,
                flags=re.IGNORECASE,
            )
            query = re.sub(r"\bnotes?\b", "", query, flags=re.IGNORECASE)
            query = re.sub(r"^(?:about|for|on)\s+", "", query, flags=re.IGNORECASE).strip(" ?.!")
            notes = Note.query.filter_by(user_id=1)
            if query:
                pattern = f"%{query}%"
                notes = notes.filter(db.or_(Note.title.ilike(pattern), Note.content.ilike(pattern)))
            matches = notes.order_by(Note.updated_at.desc()).limit(10).all()
            response = "No matching notes found." if not matches else "Here are the matching notes:\n" + "\n".join(f"• {item.title}: {item.content}" for item in matches)
            return reply(response, {"type": "note_search", "notes": [item.as_dict() for item in matches]})

        parsed = parse_reminder(message)
        if parsed and "error" in parsed:
            return reply(parsed["error"])

        if parsed:
            reminder = Reminder(
                user_id=1,
                title=parsed["title"],
                reminder_time=parsed["reminder_time"],
            )
            db.session.add(reminder)
            db.session.flush()
            record_activity("created", "reminder", reminder.id, f"Created reminder: {reminder.title}")
            formatted_time = (
                f"{reminder.reminder_time.strftime('%A, %B')} "
                f"{reminder.reminder_time.day} at "
                f"{reminder.reminder_time.strftime('%I:%M %p').lstrip('0')}"
            )
            return reply(
                f"Done! I’ll remind you to {reminder.title} on {formatted_time}.",
                {"type": "reminder_created", "reminder": reminder.as_dict()},
            )

        if "reminder" in lowered and any(word in lowered for word in ("show", "list", "what")):
            reminders = (
                Reminder.query.filter_by(user_id=1)
                .order_by(Reminder.reminder_time.asc())
                .all()
            )
            if not reminders:
                response = "You don’t have any reminders yet."
            else:
                response = "Here are your reminders:\n" + "\n".join(
                    f"• {item.title} — {item.reminder_time.strftime('%b')} "
                    f"{item.reminder_time.day}, "
                    f"{item.reminder_time.strftime('%I:%M %p').lstrip('0')}"
                    for item in reminders
                )
            return reply(response, {"type": "reminder_list"})

        if any(word in lowered for word in ("finished", "finish", "completed", "activity", "progress")):
            if "today" in lowered:
                today_start = datetime.combine(datetime.now().date(), time.min)
                completed_today = Activity.query.filter(
                    Activity.user_id == 1,
                    Activity.action == "completed",
                    Activity.created_at >= today_start,
                ).order_by(Activity.created_at.desc()).all()
                if completed_today:
                    return reply(
                        "Today you finished:\n"
                        + "\n".join(
                            f"• {item.summary.removeprefix('Completed task: ')}"
                            for item in completed_today
                        ),
                        {"type": "activity_summary"},
                    )
                return reply(
                    "You haven’t completed any tasks today yet. Pick one small task and get started.",
                    {"type": "activity_summary"},
                )
            complete_count = Task.query.filter_by(user_id=1, status="completed").count()
            total_count = Task.query.filter_by(user_id=1).count()
            return reply(
                f"You’ve completed {complete_count} of {total_count} tasks. "
                "Your recent activity is available on the Activity page.",
                {"type": "activity_summary"},
            )

        if any(phrase in lowered for phrase in ("what can you help", "what can you do", "help me with")):
            return reply(
                "I can explain topics, help with study questions, and answer current "
                "questions when Live AI is configured. I can also create or list tasks "
                "and reminders, save or search notes, and summarize your activity."
            )

        api_key = app.config.get("GEMINI_API_KEY")
        if not api_key:
            return jsonify(
                {
                    "error": (
                        "Live AI is not configured yet. Set GEMINI_API_KEY in your "
                        "environment and restart Sahayak. Local task, note, and "
                        "reminder commands still work."
                    )
                }
            ), 503
        history = [
            {"role": "model" if item.role == "assistant" else item.role, "content": item.content}
            for item in ChatHistory.query.filter_by(user_id=1)
            .order_by(ChatHistory.created_at.desc(), ChatHistory.id.desc())
            .limit(8)
            .all()[::-1]
        ]
        try:
            answer, sources = generate_grounded_answer(
                api_key,
                app.config["GEMINI_MODEL"],
                message.strip(),
                history,
            )
        except RuntimeError as exc:
            return jsonify({"error": str(exc)}), 502
        return reply(
            answer,
            {"type": "grounded_answer", "sources": sources} if sources else None,
        )

    @app.post("/api/reminders")
    def create_reminder():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"error": "Send a JSON object with title and reminder_time."}), 400
        title = payload.get("title")
        reminder_time = payload.get("reminder_time")
        if not isinstance(title, str) or not title.strip() or len(title.strip()) > 200:
            return jsonify({"error": "Title must be between 1 and 200 characters."}), 400
        try:
            parsed_time = datetime.fromisoformat(reminder_time)
        except (TypeError, ValueError):
            return jsonify({"error": "reminder_time must be an ISO date-time."}), 400

        reminder = Reminder(
            user_id=1,
            title=title.strip(),
            reminder_time=parsed_time,
        )
        db.session.add(reminder)
        db.session.flush()
        record_activity("created", "reminder", reminder.id, f"Created reminder: {reminder.title}")
        db.session.commit()
        return jsonify(reminder.as_dict()), 201

    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=3000, debug=False)
