const { useEffect, useRef, useState } = React;

const navigation = [
  ["Dashboard", "grid"],
  ["AI Assistant", "chat"],
  ["Tasks", "check"],
  ["Focus", "clock"],
  ["Reminders", "clock"],
  ["Notes", "note"],
  ["Activity", "chart"],
  ["Settings", "settings"],
];

const prompts = [
  "Remind me to study AI tomorrow at 7 PM",
  "What can you help me with?",
  "Show my reminders",
];

function loadFocusTimer() {
  try {
    const saved = JSON.parse(localStorage.getItem("sahayak-focus-timer"));
    if (!saved || !Number.isFinite(saved.secondsRemaining)) return null;
    const secondsRemaining = saved.running && Number.isFinite(saved.endsAt)
      ? Math.max(0, Math.ceil((saved.endsAt - Date.now()) / 1000))
      : saved.secondsRemaining;
    return {
      ...saved,
      secondsRemaining,
      running: Boolean(saved.running),
      endsAt: saved.running && secondsRemaining > 0 ? saved.endsAt : null,
      needsSave: Boolean(saved.needsSave || (saved.running && secondsRemaining === 0 && saved.phase === "focus")),
    };
  } catch {
    return null;
  }
}

function Icon({ name, size = 18 }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };
  const paths = {
    grid: <><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="5" rx="2" /><rect x="13" y="10" width="8" height="11" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" /></>,
    chat: <><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l1.8-3.1A7.5 7.5 0 1 1 20 11.5Z" /></>,
    check: <><path d="M9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    note: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8m-8 4h8" /></>,
    book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" /></>,
    chart: <><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-5 5" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1 0 2Z" transform="translate(-1 -1)" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>,
    moon: <path d="M20.8 14.2A8.8 8.8 0 0 1 9.8 3.2 9 9 0 1 0 20.8 14.2Z" />,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" /><path d="m19 14 1.1 2.9L23 18l-2.9 1.1L19 22l-1.1-2.9L15 18l2.9-1.1L19 14Z" /></>,
    arrow: <><path d="M12 19V5m-7 7 7-7 7 7" /></>,
    mic: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8" /></>,
    send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    checkmark: <><path d="m5 12 4 4L19 6" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
  };
  return <svg {...common}>{paths[name] || paths.spark}</svg>;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function weatherDescription(code) {
  if (code === 0) return "Clear sky";
  if ([1, 2, 3].includes(code)) return "Partly cloudy";
  if ([45, 48].includes(code)) return "Foggy";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";
  return "Current conditions";
}

function localDateTimeInput(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function localISODate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "The request failed. Please try again.");
  return data;
}

function App() {
  const [page, setPage] = useState("Dashboard");
  const [theme, setTheme] = useState(() => localStorage.getItem("sahayak-theme") === "light" ? "light" : "dark");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [assistantStatus, setAssistantStatus] = useState({ configured: false, loading: true });
  const [reminders, setReminders] = useState([]);
  const [reminderAlerts, setReminderAlerts] = useState([]);
  const [focusData, setFocusData] = useState({ sessions: [], today_minutes: 0, today_sessions: 0 });
  const [dashboardStats, setDashboardStats] = useState({ notes_total: 0 });
  const [weeklyAnalytics, setWeeklyAnalytics] = useState(null);
  const [dailyAnalytics, setDailyAnalytics] = useState(null);
  const [weatherCity, setWeatherCity] = useState(() => localStorage.getItem("sahayak-weather-city") || "");
  const [weatherCityInput, setWeatherCityInput] = useState(() => localStorage.getItem("sahayak-weather-city") || "");
  const [weather, setWeather] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");
  const [weatherRefresh, setWeatherRefresh] = useState(0);
  const [quickNote, setQuickNote] = useState({ title: "", content: "" });
  const [quickReminder, setQuickReminder] = useState(() => ({
    title: "",
    reminder_time: localDateTimeInput(new Date(Date.now() + 60 * 60 * 1000)),
  }));
  const [tasks, setTasks] = useState([]);
  const [notes, setNotes] = useState([]);
  const [activity, setActivity] = useState([]);
  const [editor, setEditor] = useState(null);
  const [noteQuery, setNoteQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [profileName, setProfileName] = useState(() => localStorage.getItem("sahayak-profile-name") || "Prajwal");
  const [voiceOutput, setVoiceOutput] = useState(() => localStorage.getItem("sahayak-voice-output") === "true");
  const [notificationPermission, setNotificationPermission] = useState(
    () => "Notification" in window ? Notification.permission : "unsupported",
  );
  const [alarmEnabled, setAlarmEnabled] = useState(false);
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [focusTaskId, setFocusTaskId] = useState("");
  const [timer, setTimer] = useState(() => loadFocusTimer());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const speechRef = useRef(null);
  const audioContextRef = useRef(null);
  const lastSpokenMessageRef = useRef("");
  const completionStartedRef = useRef("");

  async function refreshData() {
    try {
      const [dashboard, loadedNotes, loadedActivity, chatHistory, loadedFocus, loadedAnalytics, loadedDaily] = await Promise.all([
        apiRequest("/api/dashboard"),
        apiRequest(`/api/notes${noteQuery ? `?q=${encodeURIComponent(noteQuery)}` : ""}`),
        apiRequest("/api/activity"),
        apiRequest("/api/chat/history"),
        apiRequest("/api/focus/sessions"),
        apiRequest("/api/analytics/weekly"),
        apiRequest("/api/analytics/daily"),
      ]);
      setTasks(dashboard.tasks);
      setReminders(dashboard.reminders);
      setDashboardStats(dashboard.stats);
      setNotes(loadedNotes);
      setActivity(loadedActivity);
      setMessages(chatHistory);
      setFocusData(loadedFocus);
      setWeeklyAnalytics(loadedAnalytics);
      setDailyAnalytics(loadedDaily);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshData();
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      setInput((current) => `${current}${current ? " " : ""}${event.results[0][0].transcript}`);
      setListening(false);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    speechRef.current = recognition;
    return () => recognition.abort();
  }, []);

  useEffect(() => {
    apiRequest("/api/assistant/status")
      .then(setAssistantStatus)
      .catch(() => setAssistantStatus({ configured: false, loading: false }));
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!weatherCity) {
      setWeather(null);
      setWeatherError("");
      return undefined;
    }
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 12000);
    let active = true;
    async function loadWeather() {
      setWeatherLoading(true);
      setWeatherError("");
      try {
        const geocodingUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
        geocodingUrl.search = new URLSearchParams({
          name: weatherCity,
          count: "1",
          language: "en",
          format: "json",
        });
        const locationResponse = await fetch(geocodingUrl, { signal: controller.signal });
        if (!locationResponse.ok) throw new Error("Could not look up that city. Try again.");
        const locationData = await locationResponse.json();
        const location = locationData.results?.[0];
        if (!location) throw new Error("City not found. Check its spelling and try again.");

        const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
        forecastUrl.search = new URLSearchParams({
          latitude: String(location.latitude),
          longitude: String(location.longitude),
          current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m",
          timezone: "auto",
        });
        const forecastResponse = await fetch(forecastUrl, { signal: controller.signal });
        if (!forecastResponse.ok) throw new Error("Weather is temporarily unavailable. Try refreshing.");
        const forecastData = await forecastResponse.json();
        setWeather({
          city: location.name,
          region: location.admin1 || location.country || "",
          temperature: Math.round(forecastData.current.temperature_2m),
          feelsLike: Math.round(forecastData.current.apparent_temperature),
          humidity: Math.round(forecastData.current.relative_humidity_2m),
          windSpeed: Math.round(forecastData.current.wind_speed_10m),
          description: weatherDescription(forecastData.current.weather_code),
          updatedAt: forecastData.current.time,
        });
      } catch (weatherLoadError) {
        if (weatherLoadError.name === "AbortError") {
          setWeatherError("Weather request timed out. Check your connection and retry.");
        } else {
          setWeatherError(weatherLoadError.message);
        }
      } finally {
        window.clearTimeout(timeoutId);
        if (active) setWeatherLoading(false);
      }
    }
    loadWeather();
    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [weatherCity, weatherRefresh]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    if (!timer) {
      localStorage.removeItem("sahayak-focus-timer");
      return;
    }
    localStorage.setItem("sahayak-focus-timer", JSON.stringify(timer));
  }, [timer]);

  useEffect(() => {
    if (!timer?.running) return undefined;
    const intervalId = window.setInterval(() => {
      const secondsRemaining = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000));
      if (secondsRemaining > 0) {
        setTimer((current) => current ? { ...current, secondsRemaining } : null);
        return;
      }
      setTimer((current) => {
        if (!current || current.phase === "break") return null;
        return { ...current, running: false, secondsRemaining: 0, endsAt: null, needsSave: true };
      });
      if (timer.phase === "break") {
        setNotice("Break finished. Ready for another focus session?");
        if (notificationPermission === "granted") {
          new Notification("Break finished", { body: "You’re ready to focus again." });
        }
      }
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [timer?.running, timer?.endsAt]);

  useEffect(() => {
    if (!timer?.needsSave || completionStartedRef.current === timer.sessionKey) return;
    completionStartedRef.current = timer.sessionKey;
    apiRequest("/api/focus/sessions", {
      method: "POST",
      body: JSON.stringify({
        duration_minutes: timer.durationMinutes,
        task_id: timer.taskId || null,
      }),
    })
      .then(async () => {
        setNotice("Focus session complete — great work!");
        if (notificationPermission === "granted") {
          new Notification("Focus session complete", { body: "Take a well-earned break." });
        }
        setTimer((current) => current?.sessionKey === timer.sessionKey ? null : current);
        await refreshData();
      })
      .catch((saveError) => setError(saveError.message));
  }, [timer?.needsSave, timer?.retryCount]);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (!voiceOutput || lastMessage?.role !== "assistant" || lastSpokenMessageRef.current === lastMessage.text) return;
    if (!("speechSynthesis" in window)) {
      setError("Text-to-speech is not supported by this browser.");
      return;
    }
    lastSpokenMessageRef.current = lastMessage.text;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(lastMessage.text));
  }, [messages, voiceOutput]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      apiRequest(`/api/notes${noteQuery ? `?q=${encodeURIComponent(noteQuery)}` : ""}`)
        .then(setNotes)
        .catch((loadError) => setError(loadError.message));
    }, 180);
    return () => window.clearTimeout(timeoutId);
  }, [noteQuery]);

  useEffect(() => {
    let timeoutId;
    const checkDueReminders = async () => {
      const now = Date.now();
      const due = reminders.filter(
        (item) => item.status === "pending" && new Date(item.reminder_time).getTime() <= now,
      );
      const notified = new Set(JSON.parse(localStorage.getItem("sahayak-notified-reminders") || "[]"));
      const reminderKey = (item) => `${item.id}:${item.reminder_time}`;
      const unseen = due.filter((item) => !notified.has(reminderKey(item)));
      if (unseen.length) {
        setReminderAlerts((current) => {
          const existingIds = new Set(current.map((item) => item.id));
          return [...current, ...unseen.filter((item) => !existingIds.has(item.id))];
        });
        unseen.forEach((item) => {
          if (notificationPermission === "granted") {
            new Notification("Sahayak reminder", { body: item.title });
          }
          notified.add(reminderKey(item));
        });
        if (alarmEnabled) playAlarmBeep();
        localStorage.setItem("sahayak-notified-reminders", JSON.stringify([...notified]));
        try {
          await Promise.all(unseen.map((item) => apiRequest(`/api/reminders/${item.id}`, {
            method: "PATCH",
            body: JSON.stringify({ status: "completed" }),
          })));
          await refreshData();
        } catch (reminderError) {
          setError(reminderError.message);
        }
        return;
      }
      const nextReminderTime = reminders
        .filter((item) => item.status === "pending" && !notified.has(reminderKey(item)))
        .map((item) => new Date(item.reminder_time).getTime())
        .filter((reminderTime) => reminderTime > now)
        .sort((left, right) => left - right)[0];
      if (!nextReminderTime) return;
      const delay = Math.min(nextReminderTime - now, 2147483647);
      timeoutId = window.setTimeout(checkDueReminders, delay);
    };
    checkDueReminders();
    return () => window.clearTimeout(timeoutId);
  }, [alarmEnabled, notificationPermission, reminders]);

  async function sendMessage(text = input) {
    const message = text.trim();
    if (!message || busy) return;
    setError("");
    setInput("");
    setMessages((current) => [...current, { role: "user", text: message }]);
    setPage("AI Assistant");
    setMobileSidebarOpen(false);
    setBusy(true);
    try {
      const data = await apiRequest("/api/chat", {
        method: "POST",
        body: JSON.stringify({ message }),
      });
      setMessages((current) => [...current, { role: "assistant", text: data.response, action: data.action }]);
      await refreshData();
    } catch (sendError) {
      setError(sendError.message);
      setMessages((current) => [
        ...current,
        { role: "assistant", text: sendError.message },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function saveTask(event) {
    event.preventDefault();
    const body = {
      title: editor.title,
      description: editor.description || "",
      due_date: editor.due_date || null,
      priority: editor.priority || "medium",
      status: editor.status || "pending",
    };
    try {
      setBusy(true);
      await apiRequest(editor.id ? `/api/tasks/${editor.id}` : "/api/tasks", {
        method: editor.id ? "PUT" : "POST",
        body: JSON.stringify(body),
      });
      setEditor(null);
      setNotice(`Task ${editor.id ? "updated" : "created"}.`);
      await refreshData();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleTask(task) {
    try {
      const status = task.status === "completed" ? "pending" : "completed";
      await apiRequest(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await refreshData();
    } catch (updateError) {
      setError(updateError.message);
    }
  }

  async function toggleReminder(reminder) {
    try {
      const nextStatus = reminder.status === "completed" ? "pending" : "completed";
      await apiRequest(`/api/reminders/${reminder.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      if (nextStatus === "pending") {
        const delivered = new Set(JSON.parse(localStorage.getItem("sahayak-notified-reminders") || "[]"));
        delivered.delete(`${reminder.id}:${reminder.reminder_time}`);
        localStorage.setItem("sahayak-notified-reminders", JSON.stringify([...delivered]));
      }
      await refreshData();
    } catch (updateError) {
      setError(updateError.message);
    }
  }

  async function deleteEntity(type, id) {
    if (!window.confirm(`Delete this ${type}? This cannot be undone.`)) return;
    try {
      await apiRequest(`/api/${type}s/${id}`, { method: "DELETE" });
      await refreshData();
    } catch (deleteError) {
      setError(deleteError.message);
    }
  }

  async function clearConversation() {
    setPage("AI Assistant");
    setMobileSidebarOpen(false);
    try {
      await apiRequest("/api/chat/history", { method: "DELETE" });
      setMessages([]);
      setNotice("Conversation cleared.");
      setError("");
    } catch (clearError) {
      setError(clearError.message);
    }
  }

  async function saveNote(event) {
    event.preventDefault();
    try {
      setBusy(true);
      await apiRequest(editor.id ? `/api/notes/${editor.id}` : "/api/notes", {
        method: editor.id ? "PUT" : "POST",
        body: JSON.stringify({ title: editor.title, content: editor.content }),
      });
      setEditor(null);
      setNotice(`Note ${editor.id ? "updated" : "saved"}.`);
      await refreshData();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveReminder(event) {
    event.preventDefault();
    try {
      setBusy(true);
      await apiRequest(editor.id ? `/api/reminders/${editor.id}` : "/api/reminders", {
        method: editor.id ? "PUT" : "POST",
        body: JSON.stringify({ title: editor.title, reminder_time: editor.reminder_time }),
      });
      setEditor(null);
      setNotice(`Reminder ${editor.id ? "updated" : "created"}.`);
      await refreshData();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveQuickNote(event) {
    event.preventDefault();
    try {
      setBusy(true);
      await apiRequest("/api/notes", {
        method: "POST",
        body: JSON.stringify(quickNote),
      });
      setQuickNote({ title: "", content: "" });
      setNotice("Quick note saved.");
      await refreshData();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveQuickReminder(event) {
    event.preventDefault();
    try {
      setBusy(true);
      await apiRequest("/api/reminders", {
        method: "POST",
        body: JSON.stringify(quickReminder),
      });
      setQuickReminder({
        title: "",
        reminder_time: localDateTimeInput(new Date(Date.now() + 60 * 60 * 1000)),
      });
      setNotice("Quick reminder saved.");
      await refreshData();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  function saveWeatherCity(event) {
    event.preventDefault();
    const city = weatherCityInput.trim();
    if (!city) {
      setWeatherError("Enter a city name to see its weather.");
      return;
    }
    localStorage.setItem("sahayak-weather-city", city);
    setWeatherCity(city);
  }

  function startVoiceInput() {
    if (!speechRef.current) {
      setError("Voice input is not supported by this browser. Try Chrome or Edge.");
      return;
    }
    setError("");
    setListening(true);
    speechRef.current.start();
  }

  function playAlarmBeep() {
    const context = audioContextRef.current;
    if (!context) {
      setError("Click the audible alarm setting to unlock sound in this browser session.");
      return;
    }
    const scheduleBeep = () => {
      for (let group = 0; group < 3; group += 1) {
        for (let pulse = 0; pulse < 3; pulse += 1) {
          const startsAt = context.currentTime + group * 1.05 + pulse * 0.24;
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(880, startsAt);
          gain.gain.setValueAtTime(0.0001, startsAt);
          gain.gain.linearRampToValueAtTime(0.12, startsAt + 0.02);
          gain.gain.linearRampToValueAtTime(0.0001, startsAt + 0.18);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(startsAt);
          oscillator.stop(startsAt + 0.2);
        }
      }
    };
    if (context.state === "running") {
      scheduleBeep();
      return;
    }
    context.resume().then(scheduleBeep).catch((audioError) => setError(audioError.message));
  }

  async function toggleAlarmSound(enabled) {
    if (!enabled) {
      setAlarmEnabled(false);
      setNotice("Audible reminder alarms are off.");
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      setError("This browser does not support audible alarms.");
      return;
    }
    try {
      if (!audioContextRef.current) audioContextRef.current = new AudioContextClass();
      await audioContextRef.current.resume();
      if (audioContextRef.current.state !== "running") {
        throw new Error("The browser could not start audio. Check your sound settings and try again.");
      }
      setAlarmEnabled(true);
      setError("");
      setNotice("Alarm sound enabled. A test beep is playing.");
      playAlarmBeep();
    } catch (audioError) {
      setError(audioError.message);
    }
  }

  async function enableNotifications() {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      setError("This browser does not support notifications.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission !== "granted") setError("Browser notifications were not enabled.");
    } catch (permissionError) {
      setError(permissionError.message);
    }
  }

  function startFocusTimer(phase = "focus") {
    const minutes = phase === "focus" ? focusMinutes : 5;
    const seconds = minutes * 60;
    setError("");
    setNotice("");
    setTimer({
      phase,
      durationMinutes: minutes,
      taskId: phase === "focus" ? focusTaskId : "",
      secondsRemaining: seconds,
      endsAt: Date.now() + seconds * 1000,
      running: true,
      needsSave: false,
      sessionKey: `${Date.now()}-${Math.random()}`,
    });
  }

  function pauseFocusTimer() {
    if (!timer?.running) return;
    const secondsRemaining = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000));
    setTimer({ ...timer, secondsRemaining, endsAt: null, running: false });
  }

  function resumeFocusTimer() {
    if (!timer || timer.running || timer.secondsRemaining <= 0) return;
    setTimer({ ...timer, running: true, endsAt: Date.now() + timer.secondsRemaining * 1000 });
  }

  function resetFocusTimer() {
    completionStartedRef.current = "";
    setTimer(null);
    setNotice("");
  }

  function retryFocusSessionSave() {
    if (!timer?.needsSave) return;
    completionStartedRef.current = "";
    setError("");
    setTimer({ ...timer, retryCount: (timer.retryCount || 0) + 1 });
  }

  function changePage(name) {
    setPage(name);
    setError("");
    setNotice("");
    setMobileSidebarOpen(false);
    refreshData();
  }

  function dismissReminderAlerts() {
    setReminderAlerts([]);
  }

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("sahayak-theme", nextTheme);
  }

  const todayDate = localISODate(clock);
  const todayTasks = tasks.filter((task) => task.due_date === todayDate);
  const pendingTasks = tasks.filter((task) => task.status === "pending");
  const pendingReminders = reminders.filter((item) => item.status === "pending");
  const upcomingReminders = pendingReminders
    .filter((item) => new Date(item.reminder_time).getTime() >= Date.now())
    .sort((left, right) => new Date(left.reminder_time) - new Date(right.reminder_time));
  const dashboardNoteCount = dashboardStats.notes_total;
  const completedCount = tasks.filter((task) => task.status === "completed").length;
  const initials = profileName.trim().slice(0, 1).toUpperCase() || "P";
  const timerMinutes = Math.floor((timer?.secondsRemaining || 0) / 60).toString().padStart(2, "0");
  const timerSeconds = ((timer?.secondsRemaining || 0) % 60).toString().padStart(2, "0");
  const timerProgress = timer ? (timer.secondsRemaining / (timer.durationMinutes * 60)) * 100 : 100;
  const activeFocusTask = tasks.find((task) => String(task.id) === String(timer?.taskId));
  const maxWeeklyTasks = Math.max(1, ...(weeklyAnalytics?.days || []).map((day) => day.tasks_completed));
  const maxWeeklyFocus = Math.max(1, ...(weeklyAnalytics?.days || []).map((day) => day.focus_minutes));

  return (
    <div className="app-shell sahayak-shell" data-theme={theme}>
      <aside className={`sidebar ${mobileSidebarOpen ? "sidebar-open" : ""}`}>
        <button className="sahayak-brand" onClick={() => changePage("Dashboard")}>
          <span className="brand-mark"><Icon name="spark" size={20} /></span>
          <span className="brand-name">Sahayak<span>.</span></span>
          <span className="brand-tag">AI</span>
        </button>

        <button className="new-chat-button" onClick={() => { clearConversation(); inputRef.current?.focus(); }}>
          <Icon name="plus" size={17} />
          <span>Clear conversation</span>
          <kbd>⌘ K</kbd>
        </button>

        <div className="sidebar-label">MENU</div>
        <nav className="primary-nav" aria-label="Main navigation">
          {navigation.map(([name, icon]) => (
            <button
              key={name}
              className={`nav-item ${page === name ? "active" : ""}`}
              onClick={() => changePage(name)}
            >
              <Icon name={icon} size={17} />
              <span>{name}</span>
              {name === "Reminders" && reminders.length > 0 && <span className="nav-count">{reminders.length}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-note">
          <span className="online-indicator" />
          <span>Personal assistant</span>
          <span className="local-badge">LOCAL</span>
        </div>

        <div className="sidebar-bottom">
          <div className="upgrade-card">
            <div className="upgrade-icon"><Icon name="spark" size={16} /></div>
            <div className="upgrade-copy">
              <strong>Your day, in focus.</strong>
              <span>One step at a time.</span>
            </div>
          </div>
          <button className="profile" onClick={() => changePage("Settings")}>
            <span className="avatar">P</span>
            <span className="profile-copy"><strong>{profileName}</strong><small>Personal workspace</small></span>
            <span className="profile-menu">•••</span>
          </button>
        </div>
      </aside>

      {mobileSidebarOpen && (
        <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobileSidebarOpen(false)} />
      )}

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileSidebarOpen(true)}>
              <span className="hamburger">☰</span>
            </button>
            <span className="breadcrumb">Sahayak AI</span>
            <span className="breadcrumb-divider">/</span>
            <span className="breadcrumb-current">{page}</span>
          </div>
          <div className="topbar-right">
            <span className="connected-indicator"><span className="status-dot" /> All systems ready</span>
            <span className="topbar-divider" />
            <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
              <Icon name={theme === "dark" ? "sun" : "moon"} size={16} />
            </button>
            <span className="topbar-user"><span className="avatar">{initials}</span> {profileName}</span>
          </div>
        </header>

        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button aria-label="Dismiss error" onClick={() => setError("")}><Icon name="close" size={15} /></button>
          </div>
        )}
        {notice && <div className="notice-banner" role="status"><span>{notice}</span><button aria-label="Dismiss message" onClick={() => setNotice("")}><Icon name="close" size={15} /></button></div>}

        <section className={`page-content page-${page.toLowerCase().replaceAll(" ", "-")}`}>
          {page === "Dashboard" && (
            <div className="dashboard-view">
              <div className="dashboard-heading">
                <div>
                  <span className="date-label">{new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(clock).toUpperCase()} · <time>{clock.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" })}</time></span>
                  <h1>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, {profileName} <span className="wave">👋</span></h1>
                  <p>Here’s your day at a glance. What would you like to focus on?</p>
                </div>
                <div className="today-chip"><span className="today-chip-dot" /> Your personal space</div>
              </div>

              <div className="dashboard-overview">
                <section className="module-card weather-card" aria-label="Current weather">
                  <div className="weather-card-heading">
                    <span className="section-icon"><Icon name="sun" size={16} /></span>
                    <div><strong>Live weather</strong><small>{weather ? `${weather.city}${weather.region ? `, ${weather.region}` : ""}` : "Choose a city"}</small></div>
                    {weatherCity && <button className="row-icon-button" type="button" onClick={() => setWeatherRefresh((current) => current + 1)} disabled={weatherLoading}>{weatherLoading ? "Loading…" : "Refresh"}</button>}
                  </div>
                  {weather ? <div className="weather-reading">
                    <strong>{weather.temperature}<span>°C</span></strong>
                    <div><b>{weather.description}</b><small>Feels like {weather.feelsLike}° · Humidity {weather.humidity}% · Wind {weather.windSpeed} km/h</small></div>
                  </div> : <p className="weather-empty">{weatherLoading ? "Getting current conditions…" : weatherError || "Enter a city to load current conditions."}</p>}
                  <form className="weather-city-form" onSubmit={saveWeatherCity}>
                    <input value={weatherCityInput} onChange={(event) => setWeatherCityInput(event.target.value)} placeholder="City, e.g. Bengaluru" aria-label="Weather city" maxLength={100} />
                    <button className="secondary-action" type="submit">{weatherCity ? "Set city" : "Get weather"}</button>
                  </form>
                  <small className="weather-disclosure">Uses Open-Meteo live data. Your typed city is sent to its weather service; device location is not accessed.</small>
                </section>
                <section className="daily-stats-grid" aria-label="Daily productivity statistics">
                  <article className="module-card daily-stat-card"><span>Tasks completed</span><strong>{dailyAnalytics?.tasks_completed ?? "—"}</strong><small>today</small></article>
                  <article className="module-card daily-stat-card"><span>Pending tasks</span><strong>{dailyAnalytics?.pending_tasks ?? "—"}</strong><small>{dailyAnalytics?.tasks_due_today ?? 0} due today</small></article>
                  <article className="module-card daily-stat-card"><span>Focus time</span><strong>{dailyAnalytics?.focus_minutes ?? "—"}<small> min</small></strong><small>{dailyAnalytics?.focus_sessions ?? 0} sessions today</small></article>
                  <article className="module-card daily-stat-card"><span>Completion rate</span><strong>{dailyAnalytics ? `${dailyAnalytics.completion_rate}%` : "—"}</strong><small>of tracked tasks</small></article>
                </section>
              </div>

              <div className="dashboard-grid">
                <div className="dashboard-main-column">
                  <div className="quick-ask-card">
                    <div className="quick-ask-intro">
                      <span className="assistant-orb"><Icon name="spark" size={20} /></span>
                      <div><strong>Ask Sahayak</strong><span>Your thoughtful AI companion</span></div>
                    </div>
                    <form className="dashboard-composer" onSubmit={(event) => { event.preventDefault(); sendMessage(); }}>
                      <textarea
                        ref={inputRef}
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            sendMessage();
                          }
                        }}
                        placeholder="Ask me anything, or try “Remind me to study AI tomorrow at 7 PM”..."
                        aria-label="Ask Sahayak"
                        rows={2}
                      />
                      <div className="dashboard-composer-footer">
                        <div className="quick-prompts">
                          <button type="button" onClick={() => sendMessage("Show my reminders")}><Icon name="bell" size={13} /> Reminders</button>
                          <span>Enter to send · Shift + Enter for a new line</span>
                        </div>
                        <div className="quick-actions">
                          <button type="button" className={`icon-button voice-button ${listening ? "is-listening" : ""}`} aria-label="Speak to Sahayak" onClick={startVoiceInput}><Icon name="mic" size={16} /></button>
                          <button type="submit" className="send-button send-ready" aria-label="Send message" disabled={!input.trim() || busy}><Icon name="send" size={15} /></button>
                        </div>
                      </div>
                    </form>
                    <div className="example-prompts">
                      <span>TRY</span>
                      {prompts.map((prompt) => <button key={prompt} onClick={() => sendMessage(prompt)}>{prompt}</button>)}
                    </div>
                  </div>

                  <div className="section-heading">
                    <div><span className="section-icon"><Icon name="check" size={16} /></span><h2>Today’s tasks</h2><span className="section-counter">{todayTasks.filter((task) => task.status === "completed").length}/{todayTasks.length}</span></div>
                    <div className="heading-actions"><button className="text-link" onClick={() => setEditor({ type: "task", title: "", description: "", due_date: "", priority: "medium", status: "pending" })}><Icon name="plus" size={14} /> Add task</button><button className="text-link" onClick={() => changePage("Tasks")}>View all <span>→</span></button></div>
                  </div>
                  <div className="task-list-card">
                    {todayTasks.slice(0, 5).map((task) => (
                      <div className={`task-row ${task.status === "completed" ? "task-done" : ""}`} key={task.id}>
                        <button className="task-checkbox task-checkbox-button" aria-label={`Mark ${task.title} ${task.status === "completed" ? "pending" : "complete"}`} onClick={() => toggleTask(task)}>{task.status === "completed" && <Icon name="checkmark" size={13} />}</button>
                        <span className="task-title">{task.title}{task.due_date && <small className="task-due"> · Due {task.due_date}</small>}</span>
                        <span className={`task-tag tag-${task.priority}`}>{task.priority}</span>
                        <button className="row-icon-button" aria-label={`Edit ${task.title}`} onClick={() => setEditor({ type: "task", ...task })}>Edit</button>
                      </div>
                    ))}
                    {todayTasks.length === 0 && <div className="empty-inline"><span>No tasks due today. Add a task for today or see all pending work below.</span><button onClick={() => setEditor({ type: "task", title: "", description: "", due_date: todayDate, priority: "medium", status: "pending" })}>Add for today</button></div>}
                  </div>
                  <div className="section-heading pending-heading">
                    <div><span className="section-icon"><Icon name="clock" size={16} /></span><h2>Pending tasks</h2><span className="section-counter">{pendingTasks.length}</span></div>
                    <button className="text-link" onClick={() => changePage("Tasks")}>Manage tasks <span>→</span></button>
                  </div>
                  <div className="task-list-card pending-task-list">
                    {pendingTasks.slice(0, 5).map((task) => <div className="task-row" key={task.id}>
                      <button className="task-checkbox task-checkbox-button" aria-label={`Mark ${task.title} complete`} onClick={() => toggleTask(task)} />
                      <span className="task-title">{task.title}{task.due_date && <small className="task-due"> · Due {task.due_date}</small>}</span>
                      <span className={`task-tag tag-${task.priority}`}>{task.priority}</span>
                    </div>)}
                    {pendingTasks.length === 0 && <div className="empty-inline"><span>All tasks are complete. Great work!</span></div>}
                  </div>
                </div>

                <div className="dashboard-side-column">
                  <div className="module-card upcoming-events-card">
                    <div className="module-card-heading"><div><span className="section-icon"><Icon name="bell" size={16} /></span><h2>Upcoming events</h2></div><button className="text-link" onClick={() => changePage("Reminders")}>All <span>→</span></button></div>
                    {upcomingReminders.length ? <div className="upcoming-event-list">{upcomingReminders.slice(0, 5).map((reminder) => <article className="upcoming-event" key={reminder.id}>
                      <span className="upcoming-event-date">{new Date(reminder.reminder_time).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                      <span><strong>{reminder.title}</strong><small>{new Date(reminder.reminder_time).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</small></span>
                    </article>)}</div> : <div className="upcoming-empty">Nothing scheduled next. Add a reminder to see it here.</div>}
                    <button className="stat-link" onClick={() => setEditor({ type: "reminder", title: "", reminder_time: localDateTimeInput(new Date(Date.now() + 60 * 60 * 1000)) })}><Icon name="plus" size={13} /> Add reminder</button>
                  </div>
                  <div className="focus-card">
                    <div className="focus-card-heading"><span className="focus-spark">✳</span><span>DAILY FOCUS</span></div>
                    <h3>Small steps.<br /><em>Big momentum.</em></h3>
                    <p>You completed {dailyAnalytics?.tasks_completed ?? 0} tasks and focused for {dailyAnalytics?.focus_minutes ?? focusData.today_minutes} minutes today.</p>
                    <div className="progress-track"><span style={{ width: `${dailyAnalytics?.completion_rate ?? 0}%` }} /></div>
                    <div className="progress-meta"><span>Daily completion</span><strong>{dailyAnalytics?.completion_rate ?? 0}%</strong></div>
                    <button className="stat-link" onClick={() => changePage("Focus")}>Open focus timer <span>↗</span></button>
                  </div>
                  <button className="study-promo" onClick={() => changePage("Activity")}>
                    <span className="study-promo-icon"><Icon name="chart" size={17} /></span>
                    <span><strong>See your momentum</strong><small>{activity.length} recent actions</small></span>
                    <span className="study-promo-arrow">↗</span>
                  </button>
                </div>
              </div>

              <div className="quick-capture-grid">
                <form className="module-card quick-capture-card" onSubmit={saveQuickNote}>
                  <div className="module-card-heading"><div><span className="section-icon"><Icon name="note" size={16} /></span><h2>Quick note</h2></div><span className="section-counter">{dashboardNoteCount} saved</span></div>
                  <label><span className="sr-only">Quick note title</span><input value={quickNote.title} onChange={(event) => setQuickNote({ ...quickNote, title: event.target.value })} placeholder="Note title" maxLength={200} required /></label>
                  <label><span className="sr-only">Quick note content</span><textarea value={quickNote.content} onChange={(event) => setQuickNote({ ...quickNote, content: event.target.value })} placeholder="Capture an idea before it slips away…" maxLength={5000} rows={3} required /></label>
                  <button className="primary-action" type="submit" disabled={busy || !quickNote.title.trim() || !quickNote.content.trim()}><Icon name="plus" size={14} /> Save note</button>
                </form>
                <form className="module-card quick-capture-card" onSubmit={saveQuickReminder}>
                  <div className="module-card-heading"><div><span className="section-icon"><Icon name="bell" size={16} /></span><h2>Quick reminder</h2></div><span className="section-counter">{pendingReminders.length} active</span></div>
                  <label><span className="sr-only">Reminder title</span><input value={quickReminder.title} onChange={(event) => setQuickReminder({ ...quickReminder, title: event.target.value })} placeholder="What should I remind you about?" maxLength={200} required /></label>
                  <label className="quick-reminder-time"><span>Date and time</span><input type="datetime-local" min={localDateTimeInput(new Date()).slice(0, 16)} value={quickReminder.reminder_time} onChange={(event) => setQuickReminder({ ...quickReminder, reminder_time: event.target.value })} required /></label>
                  <button className="primary-action" type="submit" disabled={busy || !quickReminder.title.trim()}><Icon name="plus" size={14} /> Save reminder</button>
                </form>
              </div>
            </div>
          )}

          {page === "AI Assistant" && (
            <div className="assistant-view">
              <div className="assistant-title">
                  <span className="date-label">{assistantStatus.configured ? "LIVE AI · GOOGLE SEARCH" : "PERSONAL ASSISTANT · LOCAL COMMANDS"}</span>
                <h1>How can I help, {profileName}?</h1>
                  <p>Ask about a topic, get current information, or manage your personal workspace.</p>
              </div>
              <div className="assistant-messages">
                  {messages.length === 0 && <div className="assistant-empty"><span className="assistant-orb"><Icon name="spark" size={22} /></span><strong>Ask Sahayak anything.</strong><span>Get explanations, study help, current answers with sources, or manage tasks, notes, and reminders.</span></div>}
                {messages.map((message, index) => (
                  <article className={`message message-${message.role}`} key={index}>
                    {message.role === "assistant" ? <span className="message-avatar assistant-avatar"><Icon name="spark" size={16} /></span> : <span className="message-avatar user-avatar">{initials}</span>}
                    <div className="message-content">
                      <div className="message-meta"><strong>{message.role === "assistant" ? "Sahayak" : "You"}</strong><span>just now</span></div>
                      <p>{message.text}</p>
                      {message.action?.sources?.length > 0 && <div className="answer-sources"><strong>Sources</strong>{message.action.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}</div>}
                      {message.action?.type === "task_created" && <div className="assistant-action-card"><strong><Icon name="check" size={14} /> Task added</strong><span>{message.action.task.title}</span><button onClick={() => changePage("Tasks")}>View task</button></div>}
                      {message.action?.type === "reminder_created" && <div className="assistant-action-card"><strong><Icon name="bell" size={14} /> Reminder saved</strong><span>{message.action.reminder.title} · {formatDate(message.action.reminder.reminder_time)}</span><button onClick={() => changePage("Reminders")}>View reminder</button></div>}
                      {message.action?.type === "note_created" && <div className="assistant-action-card"><strong><Icon name="note" size={14} /> Note saved</strong><span>{message.action.note.title}</span><button onClick={() => changePage("Notes")}>View note</button></div>}
                      {message.role === "assistant" && <button className="speak-response" onClick={() => {
                        if (!("speechSynthesis" in window)) { setError("Text-to-speech is not supported by this browser."); return; }
                        window.speechSynthesis.cancel();
                        window.speechSynthesis.speak(new SpeechSynthesisUtterance(message.text));
                      }}>Read aloud</button>}
                    </div>
                  </article>
                ))}
                {busy && <article className="message message-assistant"><span className="message-avatar assistant-avatar"><Icon name="spark" size={16} /></span><div className="message-content"><div className="message-meta"><strong>Sahayak</strong><span>thinking</span></div><div className="typing-dots"><i /><i /><i /></div></div></article>}
                <div ref={messagesEndRef} />
              </div>
              <form className="assistant-composer" onSubmit={(event) => { event.preventDefault(); sendMessage(); }}>
                <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(); } }} placeholder="Message Sahayak..." aria-label="Message Sahayak" rows={2} />
                <div><button type="button" className={`icon-button voice-button ${listening ? "is-listening" : ""}`} aria-label="Speak to Sahayak" onClick={startVoiceInput}><Icon name="mic" size={16} /></button><button type="submit" className="send-button send-ready" aria-label="Send message" disabled={!input.trim() || busy}><Icon name="send" size={15} /></button></div>
              </form>
              <p className="chat-footnote">{assistantStatus.loading ? "Checking AI connection…" : assistantStatus.configured ? "General answers use Google Gemini with Google Search grounding. Your question and recent chat context are sent to Google; dashboard commands stay local." : "Live AI needs GEMINI_API_KEY configured on the server. Local task, note, and reminder commands remain available. Verify important information."}</p>
            </div>
          )}

          {page === "Reminders" && (
            <div className="module-view">
              <div className="module-heading module-heading-row"><div><span className="date-label">STAY ONE STEP AHEAD</span><h1>Your reminders</h1><p>Captured from your messages and saved on this device.</p></div><button className="primary-action" onClick={() => setEditor({ type: "reminder", title: "", reminder_time: "" })}><Icon name="plus" size={15} /> New reminder</button></div>
              <div className="module-card reminder-module">
                <div className="module-card-heading"><div><span className="section-icon"><Icon name="bell" size={16} /></span><h2>All reminders</h2></div><span className="section-counter">{reminders.length} total</span></div>
                {reminders.length === 0 ? <div className="empty-module"><span className="empty-module-icon"><Icon name="clock" size={22} /></span><strong>A clear schedule starts here.</strong><span>Ask Sahayak: “Remind me to study AI tomorrow at 7 PM.”</span><button onClick={() => changePage("AI Assistant")}>Create a reminder <span>→</span></button></div> : (
                  <div className="reminder-list">{reminders.map((reminder) => <div className="reminder-row" key={reminder.id}><button className={`task-checkbox task-checkbox-button ${reminder.status === "completed" ? "checked" : ""}`} aria-label={`Mark reminder ${reminder.title} ${reminder.status === "completed" ? "pending" : "complete"}`} onClick={() => toggleReminder(reminder)}>{reminder.status === "completed" && <Icon name="checkmark" size={13} />}</button><span className="reminder-row-icon"><Icon name="bell" size={15} /></span><span className="reminder-row-copy"><strong>{reminder.title}</strong><small>{formatDate(reminder.reminder_time)}</small></span><span className={`reminder-status status-${reminder.status}`}>{reminder.status}</span><button className="row-icon-button" onClick={() => setEditor({ type: "reminder", ...reminder, reminder_time: reminder.reminder_time })}>Edit</button><button className="row-icon-button danger" onClick={() => deleteEntity("reminder", reminder.id)}>Delete</button></div>)}</div>
                )}
              </div>
              <div className="reminder-tip"><Icon name="spark" size={15} /><span>Try “Nale evening 7 gantge AI study madbeku anta reminder hakko” to test the Kannada-English reminder example.</span></div>
            </div>
          )}

          {!["Dashboard", "AI Assistant", "Reminders"].includes(page) && (
            <div className="module-view">
              {page === "Tasks" && <>
                <div className="module-heading module-heading-row"><div><span className="date-label">MAKE SPACE FOR WHAT MATTERS</span><h1>Your tasks</h1><p>A little progress every day adds up. Changes are saved to SQLite.</p></div><button className="primary-action" onClick={() => setEditor({ type: "task", title: "", description: "", due_date: "", priority: "medium", status: "pending" })}><Icon name="plus" size={15} /> Add task</button></div>
                <div className="module-card"><div className="module-card-heading"><div><span className="section-icon"><Icon name="check" size={16} /></span><h2>All tasks</h2></div><span className="section-counter">{completedCount}/{tasks.length} done</span></div>
                  {loading ? <div className="empty-module"><strong>Loading your tasks…</strong></div> : tasks.length === 0 ? <div className="empty-module"><span className="empty-module-icon"><Icon name="check" size={22} /></span><strong>No tasks yet</strong><span>Create your first task or ask Sahayak to add one for you.</span><button onClick={() => setEditor({ type: "task", title: "", description: "", due_date: "", priority: "medium", status: "pending" })}>Create your first task <span>→</span></button></div> :
                    <div className="task-list-card task-list-module">{tasks.map((task) => <div className={`task-row ${task.status === "completed" ? "task-done" : ""}`} key={task.id}><button className={`task-checkbox task-checkbox-button ${task.status === "completed" ? "checked" : ""}`} aria-label={`Mark ${task.title} ${task.status === "completed" ? "pending" : "complete"}`} onClick={() => toggleTask(task)}>{task.status === "completed" && <Icon name="checkmark" size={13} />}</button><span className="task-title">{task.title}<small className="task-subtitle">{task.due_date ? `Due ${task.due_date}` : "No due date"} · {task.priority} priority</small></span><button className="row-icon-button" onClick={() => setEditor({ type: "task", ...task })}>Edit</button><button className="row-icon-button danger" onClick={() => deleteEntity("task", task.id)}>Delete</button></div>)}</div>}
                </div>
              </>}
              {page === "Focus" && <>
                <div className="module-heading module-heading-row">
                  <div><span className="date-label">BUILD A LITTLE MOMENTUM</span><h1>Focus timer</h1><p>Work in a focused sprint, then take a short, intentional break.</p></div>
                  {timer?.needsSave && <button className="secondary-action" onClick={retryFocusSessionSave}>Retry saving session</button>}
                </div>
                <div className="focus-layout">
                  <section className="module-card focus-timer-card" aria-label="Focus timer controls">
                    <div className="timer-phase"><span className="status-dot" /> {timer?.phase === "break" ? "SHORT BREAK" : "FOCUS SESSION"}</div>
                    <div className={`timer-face ${timer?.running ? "timer-running" : ""}`} style={{ "--timer-progress": `${timerProgress}%` }} role="timer" aria-live="off">
                      <span>{timer ? `${timerMinutes}:${timerSeconds}` : `${String(focusMinutes).padStart(2, "0")}:00`}</span>
                      <small>{timer?.running ? "IN PROGRESS" : timer?.secondsRemaining === 0 ? "COMPLETE" : timer ? "PAUSED" : "READY WHEN YOU ARE"}</small>
                    </div>
                    {timer?.taskId && <div className="timer-task-label">Working on <strong>{activeFocusTask?.title || "Selected task"}</strong></div>}
                    {!timer && <>
                      <div className="timer-options" aria-label="Focus duration">
                        {[15, 25, 50].map((minutes) => <button key={minutes} className={focusMinutes === minutes ? "timer-option selected" : "timer-option"} onClick={() => setFocusMinutes(minutes)}>{minutes} min</button>)}
                      </div>
                      <label className="focus-task-select">Link this sprint to a task
                        <select value={focusTaskId} onChange={(event) => setFocusTaskId(event.target.value)}>
                          <option value="">No task selected</option>
                          {tasks.filter((task) => task.status !== "completed").map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
                        </select>
                      </label>
                    </>}
                    <div className="timer-actions">
                      {!timer && <><button className="primary-action" onClick={() => startFocusTimer("focus")}><Icon name="check" size={15} /> Start focus</button><button className="secondary-action" onClick={() => startFocusTimer("break")}>Start 5-min break</button></>}
                      {timer?.running && <button className="primary-action" onClick={pauseFocusTimer}>Pause timer</button>}
                      {timer && !timer.running && timer.secondsRemaining > 0 && <><button className="primary-action" onClick={resumeFocusTimer}>Resume</button><button className="secondary-action" onClick={resetFocusTimer}>Reset</button></>}
                    </div>
                    <p className="timer-note">Your running timer survives a page reload. Completed focus sprints are saved to your activity and session history.</p>
                  </section>
                  <aside className="module-card focus-summary-card">
                    <span className="date-label">TODAY</span>
                    <strong className="focus-total">{focusData.today_minutes}<small> min</small></strong>
                    <span className="focus-summary-caption">focused across {focusData.today_sessions} {focusData.today_sessions === 1 ? "session" : "sessions"}</span>
                    <div className="module-card-heading"><div><span className="section-icon"><Icon name="clock" size={16} /></span><h2>Recent sessions</h2></div></div>
                    {focusData.sessions.length === 0 ? <div className="focus-history-empty">Your completed focus sprints will appear here.</div> : <div className="focus-session-list">{focusData.sessions.slice(0, 8).map((session) => <div className="focus-session-row" key={session.id}><span className="session-duration">{session.duration_minutes}<small>m</small></span><span><strong>{session.task_title || "Focus session"}</strong><small>{formatDate(session.completed_at)}</small></span></div>)}</div>}
                  </aside>
                </div>
              </>}
              {page === "Notes" && <>
                <div className="module-heading module-heading-row"><div><span className="date-label">YOUR PERSONAL KNOWLEDGE SPACE</span><h1>Your notes</h1><p>Save ideas and find them later with search or Sahayak.</p></div><button className="primary-action" onClick={() => setEditor({ type: "note", title: "", content: "" })}><Icon name="plus" size={15} /> New note</button></div>
                <label className="note-search"><span>⌕</span><input value={noteQuery} onChange={(event) => setNoteQuery(event.target.value)} placeholder="Search notes by title or content..." /></label>
                {loading && !notes.length ? <div className="module-card empty-module"><strong>Loading your notes…</strong></div> : notes.length === 0 ? <div className="module-card empty-module"><span className="empty-module-icon"><Icon name="note" size={22} /></span><strong>{noteQuery ? "No notes match your search" : "No notes yet"}</strong><span>{noteQuery ? "Try a different search, or create a note." : "Save a useful thought or ask Sahayak to remember it."}</span><button onClick={() => setEditor({ type: "note", title: "", content: "" })}>Create a note <span>→</span></button></div> : <div className="notes-grid">{notes.map((note) => <article className="note-card" key={note.id}><div className="note-card-head"><span className="note-card-icon"><Icon name="note" size={15} /></span><div><button onClick={() => setEditor({ type: "note", ...note })} className="note-title-button">{note.title}</button><small>{formatDate(note.updated_at)}</small></div><button className="row-icon-button danger" onClick={() => deleteEntity("note", note.id)}>Delete</button></div><p>{note.content}</p><button className="text-link" onClick={() => setEditor({ type: "note", ...note })}>Edit note <span>→</span></button></article>)}</div>}
              </>}
              {page === "Activity" && <>
                <div className="module-heading"><span className="date-label">A CLEAR VIEW OF YOUR MOMENTUM</span><h1>Productivity insights</h1><p>Your completed tasks and focus time from the last seven days.</p></div>
                <section className="analytics-section" aria-label="Weekly productivity summary">
                  <div className="analytics-summary">
                    <article className="module-card analytics-stat"><span>Tasks completed</span><strong>{weeklyAnalytics?.total_tasks_completed ?? "—"}</strong><small>in the last 7 days</small></article>
                    <article className="module-card analytics-stat"><span>Focus time</span><strong>{weeklyAnalytics?.total_focus_minutes ?? "—"}<small> min</small></strong><small>saved focus sessions</small></article>
                    <article className="module-card analytics-stat"><span>Active days</span><strong>{weeklyAnalytics?.active_days ?? "—"}<small> / 7</small></strong><small>with tasks or focus sessions</small></article>
                    <article className="module-card analytics-stat analytics-streak"><span>Current streak</span><strong>{weeklyAnalytics?.current_streak_days ?? "—"}<small> days</small></strong><small>consecutive days through today</small></article>
                  </div>
                  <div className="module-card weekly-chart-card">
                    <div className="module-card-heading"><div><span className="section-icon"><Icon name="chart" size={16} /></span><h2>Last 7 days</h2></div>
                      <div className="weekly-chart-legend"><span><i className="legend-task" /> Tasks</span><span><i className="legend-focus" /> Focus minutes</span></div>
                    </div>
                    {!weeklyAnalytics ? <div className="focus-history-empty">Loading your weekly insights…</div> : <div className="weekly-chart">
                      {weeklyAnalytics.days.map((day) => <div className="weekly-chart-row" key={day.date}>
                        <span className="weekly-chart-day">{day.label}</span>
                        <div className="weekly-chart-bars">
                          <div className="weekly-bar-track" aria-label={`${day.tasks_completed} tasks completed`}><span className="weekly-bar weekly-bar-tasks" style={{ width: `${day.tasks_completed / maxWeeklyTasks * 100}%` }} /></div>
                          <div className="weekly-bar-track" aria-label={`${day.focus_minutes} focus minutes`}><span className="weekly-bar weekly-bar-focus" style={{ width: `${day.focus_minutes / maxWeeklyFocus * 100}%` }} /></div>
                        </div>
                        <span className="weekly-chart-value">{day.tasks_completed} · {day.focus_minutes}m</span>
                      </div>)}
                    </div>}
                  </div>
                </section>
                <div className="module-card"><div className="module-card-heading"><div><span className="section-icon"><Icon name="chart" size={16} /></span><h2>Activity history</h2></div><span className="section-counter">{activity.length} recent</span></div>
                  {loading && !activity.length ? <div className="empty-module"><strong>Loading activity…</strong></div> : activity.length === 0 ? <div className="empty-module"><span className="empty-module-icon"><Icon name="chart" size={22} /></span><strong>Your activity will show up here</strong><span>Create a task, reminder, note, or focus session to start your history.</span></div> : <div className="activity-list">{activity.map((item) => <div className="activity-row" key={item.id}><span className={`activity-icon activity-${item.entity_type}`}><Icon name={item.entity_type === "task" ? "check" : item.entity_type === "reminder" ? "bell" : item.entity_type === "focus" ? "clock" : "note"} size={14} /></span><span className="activity-copy"><strong>{item.summary}</strong><small>{item.action} · {formatDate(item.created_at)}</small></span></div>)}</div>}
                </div>
              </>}
              {page === "Settings" && <>
                <div className="module-heading"><span className="date-label">MAKE SAHAYAK YOURS</span><h1>Settings</h1><p>Personalize the local assistant experience.</p></div>
                <div className="module-card settings-card">
                  <form onSubmit={(event) => { event.preventDefault(); localStorage.setItem("sahayak-profile-name", profileName.trim() || "Prajwal"); setProfileName(profileName.trim() || "Prajwal"); setNotice("Profile saved on this device."); setError(""); }}>
                    <label className="form-field"><span>Display name</span><input value={profileName} onChange={(event) => setProfileName(event.target.value)} maxLength={60} required /></label>
                    <button className="primary-action" type="submit">Save profile</button>
                  </form>
                  <label className="setting-toggle">
                    <span><strong>Read assistant replies aloud</strong><small>Use your browser’s speech synthesis when replying in chat.</small></span>
                    <input type="checkbox" checked={voiceOutput} onChange={(event) => { setVoiceOutput(event.target.checked); localStorage.setItem("sahayak-voice-output", String(event.target.checked)); }} />
                  </label>
                  <label className="setting-toggle">
                    <span><strong>Audible reminder alarm</strong><small>Play a repeating beep at the exact reminder time. Enable it once each time you open the app to unlock browser audio.</small></span>
                    <input type="checkbox" checked={alarmEnabled} onChange={(event) => { void toggleAlarmSound(event.target.checked); }} />
                  </label>
                  <div className="settings-info">
                    <strong>Browser reminders</strong>
                    <span>{notificationPermission === "granted" ? "Notifications enabled. The app schedules alerts for the saved time; keep this page open." : notificationPermission === "unsupported" ? "Notifications are not supported in this browser. Audible alarms can still work while this page is open." : "Enable notifications for a browser alert at the saved time. Keep this app open for reminder delivery."}</span>
                    {notificationPermission !== "granted" && notificationPermission !== "unsupported" && <button className="secondary-action" type="button" onClick={enableNotifications}>Enable browser notifications</button>}
                  </div>
                  <div className="settings-info"><strong>Storage</strong><span>Tasks, reminders, notes, and activity are stored in the local SQLite database.</span></div>
                </div>
              </>}
            </div>
          )}
        </section>
        {editor && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditor(null); }}><form className="editor-modal" onSubmit={editor.type === "task" ? saveTask : editor.type === "note" ? saveNote : saveReminder}><div className="modal-heading"><div><span className="date-label">SAHAYAK WORKSPACE</span><h2>{editor.id ? "Edit" : "Create"} {editor.type}</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={() => setEditor(null)}><Icon name="close" size={17} /></button></div><label className="form-field"><span>{editor.type === "note" ? "Title" : editor.type === "reminder" ? "What should I remind you about?" : "Task name"}</span><input value={editor.title || ""} maxLength={200} required autoFocus onChange={(event) => setEditor({ ...editor, title: event.target.value })} /></label>
          {editor.type === "task" && <><label className="form-field"><span>Description <small>Optional</small></span><textarea rows={3} maxLength={1000} value={editor.description || ""} onChange={(event) => setEditor({ ...editor, description: event.target.value })} /></label><div className="form-fields-row"><label className="form-field"><span>Due date</span><input type="date" value={editor.due_date || ""} onChange={(event) => setEditor({ ...editor, due_date: event.target.value })} /></label><label className="form-field"><span>Priority</span><select value={editor.priority || "medium"} onChange={(event) => setEditor({ ...editor, priority: event.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label></div></>}
          {editor.type === "note" && <label className="form-field"><span>Note content</span><textarea rows={7} maxLength={5000} value={editor.content || ""} required onChange={(event) => setEditor({ ...editor, content: event.target.value })} /></label>}
          {editor.type === "reminder" && <label className="form-field"><span>Date and time</span><input type="datetime-local" value={(editor.reminder_time || "").slice(0, 16)} required onChange={(event) => setEditor({ ...editor, reminder_time: event.target.value })} /></label>}
          <div className="modal-actions"><button className="secondary-action" type="button" onClick={() => setEditor(null)}>Cancel</button><button className="primary-action" type="submit" disabled={busy}>{busy ? "Saving..." : `${editor.id ? "Save changes" : "Create"} ${editor.type}`}</button></div></form></div>}
        {reminderAlerts.length > 0 && <div className="reminder-alert-backdrop" role="presentation">
          <section className="reminder-alert" role="alertdialog" aria-modal="true" aria-labelledby="reminder-alert-title">
            <span className="reminder-alert-icon"><Icon name="bell" size={20} /></span>
            <span className="date-label">SAHAYAK REMINDER</span>
            <h2 id="reminder-alert-title">{reminderAlerts.length === 1 ? "It’s time" : `${reminderAlerts.length} reminders are due`}</h2>
            <div className="reminder-alert-list">{reminderAlerts.map((item) => <article key={item.id}><strong>{item.title}</strong><small>Scheduled for {formatDate(item.reminder_time)}</small></article>)}</div>
            <div className="reminder-alert-actions">
              <button className="secondary-action" onClick={() => { dismissReminderAlerts(); changePage("Reminders"); }}>View reminders</button>
              <button className="primary-action" onClick={dismissReminderAlerts}>Dismiss</button>
            </div>
          </section>
        </div>}
        <nav className="mobile-bottom-nav" aria-label="Quick navigation">{navigation.slice(0, 5).map(([name, icon]) => <button key={name} className={page === name ? "active" : ""} onClick={() => changePage(name)}><Icon name={icon} size={17} /><span>{name === "AI Assistant" ? "AI" : name === "Reminders" ? "Remind" : name === "Dashboard" ? "Home" : name}</span></button>)}</nav>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
