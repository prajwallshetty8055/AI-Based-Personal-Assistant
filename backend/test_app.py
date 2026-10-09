import io
import json
import unittest
from datetime import datetime
from unittest.mock import patch

from backend.app import (
    Activity,
    ChatHistory,
    FocusSession,
    Note,
    Reminder,
    Task,
    create_app,
    db,
    parse_reminder,
)


class ReminderParserTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 8, 10, 0)

    def test_parses_english_reminder(self):
        result = parse_reminder(
            "Create a reminder to study AI tomorrow at 7 PM.", self.now
        )
        self.assertEqual(result["title"], "study AI")
        self.assertEqual(result["reminder_time"], datetime(2026, 10, 9, 19, 0))

    def test_parses_kannada_english_reminder(self):
        result = parse_reminder(
            "Nale evening 7 gantge AI study madbeku anta reminder hakko.",
            self.now,
        )
        self.assertEqual(result["title"], "AI study madbeku")
        self.assertEqual(result["reminder_time"], datetime(2026, 10, 9, 19, 0))

    def test_requests_missing_time(self):
        result = parse_reminder("Remind me to study AI tomorrow", self.now)
        self.assertIn("error", result)

    def test_regular_chat_is_not_a_reminder(self):
        self.assertIsNone(parse_reminder("Explain cloud computing.", self.now))

    def test_parses_task_with_due_date(self):
        from backend.app import parse_task_message

        result = parse_task_message(
            "Create a task to finish my AI project tomorrow.",
            self.now,
        )
        self.assertEqual(result["title"], "finish my AI project")
        self.assertEqual(result["due_date"].isoformat(), "2026-10-09")


class ReminderApiTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(
            {
                "TESTING": True,
                "SQLALCHEMY_DATABASE_URI": "sqlite://",
            }
        )
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        self.client = self.app.test_client()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        db.engine.dispose()
        self.context.pop()

    def test_chat_creates_persisted_reminder(self):
        response = self.client.post(
            "/api/chat",
            json={"message": "Remind me to study AI tomorrow at 7 PM"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["action"]["type"], "reminder_created")
        self.assertEqual(Reminder.query.count(), 1)

        reminders = self.client.get("/api/reminders")
        self.assertEqual(len(reminders.json), 1)
        self.assertEqual(reminders.json[0]["title"], "study AI")

    def test_chat_validates_empty_message(self):
        response = self.client.post("/api/chat", json={"message": " "})
        self.assertEqual(response.status_code, 400)

    def test_assistant_status_does_not_expose_api_key(self):
        self.app.config["GEMINI_API_KEY"] = "test-secret"
        status = self.client.get("/api/assistant/status")
        self.assertEqual(status.json, {
            "provider": "Google Gemini",
            "configured": True,
            "live_search": True,
        })
        self.assertNotIn("test-secret", status.get_data(as_text=True))

    def test_general_chat_requires_provider_configuration(self):
        response = self.client.post("/api/chat", json={"message": "Explain quantum computing"})
        self.assertEqual(response.status_code, 503)
        self.assertIn("GEMINI_API_KEY", response.json["error"])
        self.assertEqual(ChatHistory.query.count(), 0)

    def test_chat_help_does_not_require_provider_configuration(self):
        response = self.client.post("/api/chat", json={"message": "What can you help me with?"})
        self.assertEqual(response.status_code, 200)
        self.assertIn("answer current questions", response.json["response"])
        self.assertEqual(ChatHistory.query.count(), 2)

    def test_general_chat_uses_grounded_provider_and_saves_sources(self):
        self.app.config.update(
            GEMINI_API_KEY="test-secret",
            GEMINI_MODEL="gemini-test",
        )
        provider_response = {
            "steps": [{
                "type": "model_output",
                "content": [{
                    "type": "text",
                    "text": "Quantum computing uses quantum states.",
                    "annotations": [{
                        "type": "url_citation",
                        "url": "https://example.com/quantum",
                        "title": "Quantum computing overview",
                    }],
                }],
            }]
        }
        with patch(
            "backend.app.urlopen",
            return_value=io.BytesIO(json.dumps(provider_response).encode("utf-8")),
        ) as mocked_urlopen:
            response = self.client.post(
                "/api/chat",
                json={"message": "Explain quantum computing"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["response"], "Quantum computing uses quantum states.")
        self.assertEqual(response.json["action"]["sources"][0]["title"], "Quantum computing overview")
        sent_payload = json.loads(mocked_urlopen.call_args.args[0].data)
        self.assertEqual(sent_payload["tools"], [{"type": "google_search"}])
        self.assertFalse(sent_payload["store"])
        self.assertEqual(ChatHistory.query.count(), 2)
        self.assertEqual(
            ChatHistory.query.order_by(ChatHistory.id.desc()).first().as_dict()["action"]["sources"][0]["url"],
            "https://example.com/quantum",
        )

    def test_manual_reminder_endpoint_validates_and_creates(self):
        response = self.client.post(
            "/api/reminders",
            json={
                "title": "Submit assignment",
                "reminder_time": "2026-10-09T19:00:37",
            },
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json["title"], "Submit assignment")
        self.assertEqual(response.json["reminder_time"], "2026-10-09T19:00:37")

    def test_task_crud_persists_and_records_activity(self):
        created = self.client.post(
            "/api/tasks",
            json={
                "title": "Finish AI project",
                "due_date": "2026-10-09",
                "priority": "high",
            },
        )
        self.assertEqual(created.status_code, 201)
        task_id = created.json["id"]
        self.assertEqual(created.json["status"], "pending")

        updated = self.client.patch(
            f"/api/tasks/{task_id}",
            json={"status": "completed"},
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json["status"], "completed")
        self.assertEqual(self.client.get("/api/tasks").json[0]["status"], "completed")
        self.assertEqual(Activity.query.count(), 2)
        self.assertEqual(Activity.query.order_by(Activity.id.desc()).first().action, "completed")

        deleted = self.client.delete(f"/api/tasks/{task_id}")
        self.assertEqual(deleted.status_code, 204)
        self.assertEqual(Task.query.count(), 0)

    def test_notes_crud_and_search(self):
        created = self.client.post(
            "/api/notes",
            json={
                "title": "DBMS normalization",
                "content": "Normalization reduces data redundancy.",
            },
        )
        self.assertEqual(created.status_code, 201)
        note_id = created.json["id"]
        self.assertEqual(len(self.client.get("/api/notes?q=redundancy").json), 1)

        updated = self.client.patch(
            f"/api/notes/{note_id}",
            json={"content": "Normalization improves data organization."},
        )
        self.assertEqual(updated.status_code, 200)
        self.assertIn("organization", updated.json["content"])
        self.assertEqual(self.client.delete(f"/api/notes/{note_id}").status_code, 204)
        self.assertEqual(Note.query.count(), 0)

    def test_chat_tools_create_task_and_note(self):
        task_response = self.client.post(
            "/api/chat",
            json={"message": "Create a task to finish my AI project tomorrow."},
        )
        self.assertEqual(task_response.json["action"]["type"], "task_created")
        note_response = self.client.post(
            "/api/chat",
            json={"message": "Save this: DBMS normalization reduces data redundancy."},
        )
        self.assertEqual(note_response.json["action"]["type"], "note_created")
        self.assertEqual(Task.query.count(), 1)
        self.assertEqual(Note.query.count(), 1)

    def test_chat_can_list_and_complete_tasks(self):
        created = self.client.post(
            "/api/chat",
            json={"message": "Create a task to review lecture notes today."},
        )
        task_id = created.json["action"]["task"]["id"]
        listed = self.client.post("/api/chat", json={"message": "Show my tasks"})
        self.assertIn("review lecture notes", listed.json["response"])

        completed = self.client.post(
            "/api/chat",
            json={"message": "Mark review lecture notes complete"},
        )
        self.assertEqual(completed.json["action"]["task"]["id"], task_id)
        self.assertEqual(db.session.get(Task, task_id).status, "completed")

    def test_chat_can_search_notes(self):
        self.client.post(
            "/api/notes",
            json={
                "title": "AI revision",
                "content": "Neural networks learn patterns.",
            },
        )
        result = self.client.post(
            "/api/chat",
            json={"message": "Find my AI notes"},
        )
        self.assertEqual(result.json["action"]["type"], "note_search")
        self.assertEqual(len(result.json["action"]["notes"]), 1)

    def test_reminder_can_be_updated_and_deleted(self):
        created = self.client.post(
            "/api/reminders",
            json={
                "title": "Study",
                "reminder_time": "2026-10-09T19:00",
            },
        )
        reminder_id = created.json["id"]
        updated = self.client.patch(
            f"/api/reminders/{reminder_id}",
            json={"status": "completed"},
        )
        self.assertEqual(updated.json["status"], "completed")
        self.assertEqual(
            self.client.delete(f"/api/reminders/{reminder_id}").status_code,
            204,
        )
        self.assertEqual(Reminder.query.count(), 0)

    def test_dashboard_returns_database_backed_counts(self):
        self.client.post("/api/tasks", json={"title": "Finish assignment"})
        self.client.post(
            "/api/notes",
            json={"title": "Study note", "content": "Remember this"},
        )
        data = self.client.get("/api/dashboard").json
        self.assertEqual(data["stats"]["tasks_total"], 1)
        self.assertEqual(data["stats"]["notes_total"], 1)
        self.assertEqual(len(data["activity"]), 2)

    def test_weekly_analytics_summarizes_completed_work(self):
        task = self.client.post("/api/tasks", json={"title": "Finish analytics report"}).json
        self.client.patch(
            f"/api/tasks/{task['id']}",
            json={"status": "completed"},
        )
        self.client.post(
            "/api/focus/sessions",
            json={"duration_minutes": 25, "task_id": task["id"]},
        )

        response = self.client.get("/api/analytics/weekly")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json["days"]), 7)
        self.assertEqual(response.json["total_tasks_completed"], 1)
        self.assertEqual(response.json["total_focus_minutes"], 25)
        self.assertEqual(response.json["active_days"], 1)
        self.assertEqual(response.json["current_streak_days"], 1)
        self.assertEqual(response.json["days"][-1]["focus_minutes"], 25)

    def test_daily_analytics_reports_tasks_due_completed_and_focus(self):
        today = datetime.now().date().isoformat()
        due_task = self.client.post(
            "/api/tasks",
            json={"title": "Submit daily report", "due_date": today},
        ).json
        self.client.post("/api/tasks", json={"title": "Review notes"})
        self.client.patch(
            f"/api/tasks/{due_task['id']}",
            json={"status": "completed"},
        )
        self.client.post(
            "/api/focus/sessions",
            json={"duration_minutes": 15, "task_id": due_task["id"]},
        )

        response = self.client.get("/api/analytics/daily")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["date"], today)
        self.assertEqual(response.json["tasks_completed"], 1)
        self.assertEqual(response.json["tasks_due_today"], 1)
        self.assertEqual(response.json["pending_tasks"], 1)
        self.assertEqual(response.json["focus_minutes"], 15)
        self.assertEqual(response.json["focus_sessions"], 1)
        self.assertEqual(response.json["completion_rate"], 50)

    def test_chat_history_survives_requests_and_can_be_cleared(self):
        self.client.post("/api/chat", json={"message": "What can you help with?"})
        history = self.client.get("/api/chat/history")
        self.assertEqual([item["role"] for item in history.json], ["user", "assistant"])
        self.assertEqual(history.json[0]["text"], "What can you help with?")
        self.assertEqual(ChatHistory.query.count(), 2)

        cleared = self.client.delete("/api/chat/history")
        self.assertEqual(cleared.status_code, 204)
        self.assertEqual(self.client.get("/api/chat/history").json, [])

    def test_focus_session_records_task_and_activity(self):
        task = self.client.post(
            "/api/tasks",
            json={"title": "Review database indexes"},
        ).json
        response = self.client.post(
            "/api/focus/sessions",
            json={"duration_minutes": 25, "task_id": task["id"]},
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json["task_title"], "Review database indexes")
        self.assertEqual(FocusSession.query.count(), 1)
        self.assertIn("focus session", Activity.query.order_by(Activity.id.desc()).first().summary)

        summary = self.client.get("/api/focus/sessions").json
        self.assertEqual(summary["today_sessions"], 1)
        self.assertEqual(summary["today_minutes"], 25)

    def test_focus_session_validates_duration_and_task(self):
        invalid_duration = self.client.post(
            "/api/focus/sessions",
            json={"duration_minutes": 0},
        )
        self.assertEqual(invalid_duration.status_code, 400)
        missing_task = self.client.post(
            "/api/focus/sessions",
            json={"duration_minutes": 25, "task_id": 999},
        )
        self.assertEqual(missing_task.status_code, 404)
        self.assertEqual(FocusSession.query.count(), 0)

    def test_focus_history_survives_deleting_linked_task(self):
        task = self.client.post("/api/tasks", json={"title": "Read chapter"}).json
        self.client.post(
            "/api/focus/sessions",
            json={"duration_minutes": 25, "task_id": task["id"]},
        )
        deleted = self.client.delete(f"/api/tasks/{task['id']}")
        self.assertEqual(deleted.status_code, 204)
        history = self.client.get("/api/focus/sessions")
        self.assertEqual(history.status_code, 200)
        self.assertIsNone(history.json["sessions"][0]["task_id"])


if __name__ == "__main__":
    unittest.main()
