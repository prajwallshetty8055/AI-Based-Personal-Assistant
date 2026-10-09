import { useEffect, useRef, useState } from "react";

const initialChats = [
  {
    id: 1,
    title: "React component architecture",
    time: "2 min ago",
    messages: [
      {
        role: "user",
        text: "How should I structure a scalable React component library?",
      },
      {
        role: "assistant",
        text: "A good component library starts with clear layers: design tokens, primitives, composed components, and page-level patterns. Keep each layer independent, document your public API, and use composition over deep prop configuration.",
      },
    ],
  },
  { id: 2, title: "Understanding WebSockets", time: "Yesterday", messages: [] },
  { id: 3, title: "Landing page color system", time: "Yesterday", messages: [] },
];

const suggestions = [
  {
    icon: "✳",
    title: "Build something",
    prompt: "Help me plan a clean, scalable React app architecture.",
  },
  {
    icon: "⌘",
    title: "Write some code",
    prompt: "Show me a useful JavaScript pattern with a short example.",
  },
  {
    icon: "◈",
    title: "Explore an idea",
    prompt: "Explain how AI agents work in a simple, practical way.",
  },
  {
    icon: "↗",
    title: "Learn a concept",
    prompt: "What makes a great developer experience?",
  },
];

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
    plus: <><path d="M12 5v14M5 12h14" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    chat: <><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l1.8-3.1A7.5 7.5 0 1 1 20 11.5Z" /></>,
    panel: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>,
    paperclip: <><path d="m8 12.5 6.1-6.1a3.2 3.2 0 0 1 4.5 4.5l-8.1 8.1a5 5 0 0 1-7.1-7.1l8-8" /></>,
    arrow: <><path d="M12 19V5m-7 7 7-7 7 7" /></>,
    spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" /><path d="m19 14 1.1 2.9L23 18l-2.9 1.1L19 22l-1.1-2.9L15 18l2.9-1.1L19 14Z" /></>,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  };

  return <svg {...common}>{paths[name]}</svg>;
}

function makeReply(prompt) {
  const normalized = prompt.toLowerCase();
  if (normalized.includes("react") || normalized.includes("component")) {
    return "Start with the user experience, then split your UI into small, focused components. In React, keep state close to where it’s used, extract shared behavior into hooks, and make reusable components flexible through composition. Want me to sketch out a folder structure for your project?";
  }
  if (normalized.includes("javascript") || normalized.includes("code")) {
    return "A handy JavaScript habit is to make data transformations explicit with methods like `map`, `filter`, and `reduce`. For example, `items.filter(item => item.active).map(item => item.name)` reads like a sentence and is easy to maintain.";
  }
  if (normalized.includes("ai") || normalized.includes("agent")) {
    return "Think of an AI agent as a system that can reason through a goal, choose tools, and take a sequence of steps. A simple agent might receive a question, search documentation, summarize what it finds, and then respond—with guardrails at each step.";
  }
  if (normalized.includes("design") || normalized.includes("color") || normalized.includes("landing")) {
    return "A strong interface color system usually has a neutral foundation, one primary brand color, and a small set of semantic colors for success, warning, and errors. Define these as tokens first, then check contrast and consistency across real screens.";
  }
  return "Great question. I’d break this into a few clear steps: define the outcome you want, identify the simplest approach, and test it with a small example before scaling up. If you share a little more context, I can make the recommendation more specific.";
}

function App() {
  const [chats, setChats] = useState(initialChats);
  const [activeId, setActiveId] = useState(null);
  const [input, setInput] = useState("");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const activeChat = chats.find((chat) => chat.id === activeId);
  const messages = activeChat?.messages ?? [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function startNewChat() {
    setActiveId(null);
    setInput("");
    setMobileSidebarOpen(false);
    inputRef.current?.focus();
  }

  function sendMessage(text = input) {
    const message = text.trim();
    if (!message) return;

    const id = activeId ?? Date.now();
    const isNewChat = !activeId;
    const userMessage = { role: "user", text: message };
    const assistantMessage = { role: "assistant", text: makeReply(message) };

    setChats((current) => {
      if (isNewChat) {
        return [
          {
            id,
            title: message.length > 32 ? `${message.slice(0, 32)}…` : message,
            time: "Just now",
            messages: [userMessage, assistantMessage],
          },
          ...current,
        ];
      }
      return current.map((chat) =>
        chat.id === id
          ? {
              ...chat,
              time: "Just now",
              messages: [...chat.messages, userMessage, assistantMessage],
            }
          : chat,
      );
    });
    setActiveId(id);
    setInput("");
    setMobileSidebarOpen(false);
  }

  function handleSubmit(event) {
    event.preventDefault();
    sendMessage();
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileSidebarOpen ? "sidebar-open" : ""}`}>
        <a className="brand" href="#" onClick={(event) => event.preventDefault()}>
          <span className="brand-mark"><Icon name="spark" size={21} /></span>
          <span className="brand-name">nexus<span>.</span></span>
          <span className="brand-tag">AI</span>
        </a>

        <button className="new-chat-button" onClick={startNewChat}>
          <Icon name="plus" size={17} />
          <span>New conversation</span>
          <kbd>⌘ K</kbd>
        </button>

        <div className="sidebar-label">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Workspace">
          <button className="nav-item active"><Icon name="chat" /><span>Chat</span></button>
          <button className="nav-item"><Icon name="spark" /><span>Explore</span><span className="nav-new">NEW</span></button>
        </nav>

        <div className="history-heading">
          <span className="sidebar-label">RECENT</span>
          <button
            className={`icon-button search-button ${searchOpen ? "selected" : ""}`}
            aria-label={searchOpen ? "Close search" : "Search conversations"}
            onClick={() => setSearchOpen((open) => !open)}
          >
            <Icon name="search" size={15} />
          </button>
        </div>
        {searchOpen && (
          <input
            className="conversation-search"
            aria-label="Search conversations"
            placeholder="Find a conversation..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        )}

        <div className="conversation-list">
          {chats.filter((chat) => chat.title.toLowerCase().includes(searchQuery.toLowerCase())).map((chat) => (
            <button
              key={chat.id}
              className={`conversation-item ${activeId === chat.id ? "conversation-active" : ""}`}
              onClick={() => {
                setActiveId(chat.id);
                setMobileSidebarOpen(false);
              }}
            >
              <Icon name="chat" size={15} />
              <span>{chat.title}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-bottom">
          <div className="upgrade-card">
            <div className="upgrade-icon"><Icon name="spark" size={16} /></div>
            <div className="upgrade-copy">
              <strong>More room to think.</strong>
              <span>Explore Nexus Pro</span>
            </div>
            <Icon name="arrow" size={15} />
          </div>
          <button className="profile">
            <span className="avatar">JD</span>
            <span className="profile-copy"><strong>Jordan Davis</strong><small>Free plan</small></span>
            <Icon name="more" size={17} />
          </button>
        </div>
      </aside>

      {mobileSidebarOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileSidebarOpen(true)}
            >
              <Icon name="panel" />
            </button>
            <span className="breadcrumb">Workspace</span>
            <span className="breadcrumb-divider">/</span>
            <span className="breadcrumb-current">Chat</span>
          </div>
          <div className="topbar-right">
            <div className="model-indicator"><span className="status-dot" /> Nexus 2.0 <span className="model-caret">⌄</span></div>
            <span className="topbar-divider" />
            <button className="icon-button theme-button" aria-label="Theme settings"><Icon name="sun" size={17} /></button>
            <button className="share-button"><span>Share</span><Icon name="arrow" size={14} /></button>
          </div>
        </header>

        <section className={`chat-area ${messages.length ? "has-messages" : ""}`}>
          {messages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-eyebrow"><span className="eyebrow-line" /> YOUR AI WORKSPACE <span className="eyebrow-line" /></div>
              <h1>Your next breakthrough<br />starts <span>here.</span></h1>
              <p className="welcome-description">Think bigger, move faster. Your AI-powered space for ideas,<br className="desktop-break" /> code, and everything in between.</p>

              <div className="suggestion-grid">
                {suggestions.map((suggestion) => (
                  <button
                    className="suggestion-card"
                    key={suggestion.title}
                    onClick={() => sendMessage(suggestion.prompt)}
                  >
                    <span className="suggestion-icon">{suggestion.icon}</span>
                    <span className="suggestion-title">{suggestion.title}</span>
                    <span className="suggestion-prompt">{suggestion.prompt}</span>
                    <span className="suggestion-arrow">↗</span>
                  </button>
                ))}
              </div>
              <div className="privacy-note"><span className="privacy-lock">⌑</span> Your conversations are private and secure</div>
            </div>
          ) : (
            <div className="message-thread">
              <div className="thread-heading">
                <span className="thread-date">TODAY</span>
                <span className="thread-line" />
              </div>
              {messages.map((message, index) => (
                <article className={`message message-${message.role}`} key={`${activeId}-${index}`}>
                  {message.role === "assistant" ? (
                    <span className="message-avatar assistant-avatar"><Icon name="spark" size={17} /></span>
                  ) : (
                    <span className="message-avatar user-avatar">JD</span>
                  )}
                  <div className="message-content">
                    <div className="message-meta">
                      <strong>{message.role === "assistant" ? "Nexus" : "You"}</strong>
                      <span>{message.role === "assistant" ? "just now" : "just now"}</span>
                    </div>
                    <p>{message.text}</p>
                  </div>
                </article>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </section>

        <div className="composer-wrap">
          <form className="composer" onSubmit={handleSubmit}>
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
              placeholder="Ask anything, build something..."
              rows={1}
              aria-label="Message Nexus"
            />
            <div className="composer-toolbar">
              <div className="composer-tools">
                <button type="button" className="icon-button attach-button" aria-label="Attach a file"><Icon name="paperclip" size={17} /></button>
                <span className="composer-hint">Attach files</span>
                <span className="tool-divider" />
                <button type="button" className="mode-button"><Icon name="spark" size={14} /> <span>Think</span><span className="mode-caret">⌄</span></button>
              </div>
              <div className="composer-actions">
                <span className="send-hint"><kbd>↵</kbd> to send</span>
                <button type="submit" className={`send-button ${input.trim() ? "send-ready" : ""}`} aria-label="Send message" disabled={!input.trim()}>
                  <Icon name="arrow" size={17} />
                </button>
              </div>
            </div>
          </form>
          <div className="disclaimer">Nexus can make mistakes. Verify important information.</div>
        </div>
      </main>
    </div>
  );
}

export default App;
