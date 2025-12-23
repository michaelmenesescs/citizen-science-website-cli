"use client";
import React, { useState, useEffect, useRef } from "react";

type View = "main" | "links" | "player" | "about";

// Social media links
const SOCIAL_LINKS = {
  bandcamp: "https://citizensciencemusic.bandcamp.com/",
  instagram: "https://www.instagram.com/citizensciencemusic/",
  audius: "https://audius.co/citizensciencemusic",
  soundcloud: "https://soundcloud.com/citizen-science-268058692",
  email: "mailto:info@citizensciencemusic.com",
};

export default function CLIStyleApp() {
  const [currentView, setCurrentView] = useState<View>("main");
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [input, setInput] = useState("");
  const [output, setOutput] = useState<string[]>([]);
  const [showSoundCloud, setShowSoundCloud] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  // Focus input on mount and when clicking
  useEffect(() => {
    inputRef.current?.focus();
  }, [currentView]);

  // Scroll output to bottom
  useEffect(() => {
    outputRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [output]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Tab to switch views
      if (e.key === "Tab" && !e.shiftKey && document.activeElement === inputRef.current) {
        e.preventDefault();
        const views: View[] = ["main", "links", "player", "about"];
        const currentIdx = views.indexOf(currentView);
        setCurrentView(views[(currentIdx + 1) % views.length]);
      }
      // Escape to clear input
      if (e.key === "Escape") {
        setInput("");
        setHistoryIndex(-1);
      }
      // Ctrl+L to clear output
      if (e.key === "l" && e.ctrlKey) {
        e.preventDefault();
        setOutput([]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentView]);

  function addOutput(lines: string | string[]) {
    const newLines = Array.isArray(lines) ? lines : [lines];
    setOutput((prev) => [...prev, ...newLines]);
  }

  function runCommand(cmd: string) {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    // Add to history
    setCommandHistory((prev) => [...prev, trimmed]);
    setHistoryIndex(-1);
    addOutput(`$ ${trimmed}`);

    // Process command
    setTimeout(() => {
      if (trimmed === "help" || trimmed === "h") {
        addOutput([
          "Available commands:",
          "  help, h          - Show this help",
          "  links, l         - Show all links",
          "  soundcloud, sc   - Show SoundCloud player",
          "  bandcamp, bc     - Open Bandcamp link",
          "  instagram, ig    - Open Instagram link",
          "  audius, au       - Open Audius link",
          "  email, e         - Open email client",
          "  about, a         - About Citizen Science",
          "  clear, c         - Clear screen",
          "",
          "Navigation:",
          "  Tab              - Switch views",
          "  ↑/↓              - Navigate command history",
          "  Esc              - Clear input",
          "  Ctrl+L           - Clear output",
        ]);
      } else if (trimmed === "links" || trimmed === "l") {
        setCurrentView("links");
        addOutput("Showing all links...");
      } else if (trimmed === "soundcloud" || trimmed === "sc") {
        setShowSoundCloud(true);
        setCurrentView("player");
        setIframeError(false);
        addOutput("Loading SoundCloud player...");
      } else if (trimmed === "bandcamp" || trimmed === "bc") {
        window.open(SOCIAL_LINKS.bandcamp, "_blank");
        addOutput(`Opening Bandcamp: ${SOCIAL_LINKS.bandcamp}`);
      } else if (trimmed === "instagram" || trimmed === "ig") {
        window.open(SOCIAL_LINKS.instagram, "_blank");
        addOutput(`Opening Instagram: ${SOCIAL_LINKS.instagram}`);
      } else if (trimmed === "audius" || trimmed === "au") {
        window.open(SOCIAL_LINKS.audius, "_blank");
        addOutput(`Opening Audius: ${SOCIAL_LINKS.audius}`);
      } else if (trimmed === "email" || trimmed === "e") {
        window.location.href = SOCIAL_LINKS.email;
        addOutput(`Opening email client...`);
      } else if (trimmed === "about" || trimmed === "a") {
        setCurrentView("about");
        addOutput([
          "Citizen Science",
          "Sonic meditations. Oscillating the mind with sound...",
        ]);
      } else if (trimmed === "clear" || trimmed === "c") {
        setOutput([]);
        return;
      } else {
        addOutput(`Command not found: ${trimmed}. Type 'help' for available commands.`);
      }
    }, 100);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      runCommand(input);
      setInput("");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = historyIndex === -1 
          ? commandHistory.length - 1 
          : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setInput(commandHistory[newIndex]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex >= 0) {
        const newIndex = historyIndex + 1;
        if (newIndex >= commandHistory.length) {
          setHistoryIndex(-1);
          setInput("");
        } else {
          setHistoryIndex(newIndex);
          setInput(commandHistory[newIndex]);
        }
      }
    }
  }

  function renderView() {
    switch (currentView) {
      case "links":
        return (
          <div className="flex flex-col gap-2">
            <div className="text-cyan-400">┌─ Links ──────────────────────────┐</div>
            <div className="pl-4 space-y-3">
              <a 
                href={SOCIAL_LINKS.soundcloud} 
                target="_blank" 
                rel="noopener noreferrer"
                className="block text-soft-green hover:text-soft-green/80 transition-colors"
              >
                → SoundCloud
              </a>
              <a 
                href={SOCIAL_LINKS.bandcamp} 
                target="_blank" 
                rel="noopener noreferrer"
                className="block text-soft-green hover:text-soft-green/80 transition-colors"
              >
                → Bandcamp
              </a>
              <a 
                href={SOCIAL_LINKS.instagram} 
                target="_blank" 
                rel="noopener noreferrer"
                className="block text-soft-green hover:text-soft-green/80 transition-colors"
              >
                → Instagram
              </a>
              <a 
                href={SOCIAL_LINKS.audius} 
                target="_blank" 
                rel="noopener noreferrer"
                className="block text-soft-green hover:text-soft-green/80 transition-colors"
              >
                → Audius
              </a>
              <a 
                href={SOCIAL_LINKS.email} 
                className="block text-soft-green hover:text-soft-green/80 transition-colors"
              >
                → Email
              </a>
            </div>
            <div className="text-cyan-400">└──────────────────────────────────┘</div>
          </div>
        );
      case "player":
        return (
          <div className="flex flex-col gap-2">
            <div className="text-cyan-400">┌─ SoundCloud Player ──────────────┐</div>
            {showSoundCloud && (
              <div className="pl-2 pr-2 pb-2">
                {!iframeError ? (
                  <>
                    <div className="terminal-iframe-wrapper">
                      <div className="terminal-iframe-container">
                        <iframe
                          width="100%"
                          height="300"
                          scrolling="no"
                          frameBorder="no"
                          allow="autoplay"
                          loading="eager"
                          src="https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/soundcloud%3Atracks%3A1779251895%3Fsecret_token%3Ds-cA3kVlCGbrK&color=%2366ff99&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true&visual=true"
                          title="SoundCloud Player - The Vision"
                          onLoad={() => setIframeError(false)}
                          onError={() => setIframeError(true)}
                        />
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      The Vision — Citizen Science
                    </div>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <a 
                        href={SOCIAL_LINKS.bandcamp} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-xs px-2 py-1 border border-soft-green text-soft-green hover:bg-soft-green/10 transition-colors"
                      >
                        Bandcamp
                      </a>
                      <a 
                        href={SOCIAL_LINKS.instagram} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-xs px-2 py-1 border border-soft-green text-soft-green hover:bg-soft-green/10 transition-colors"
                      >
                        Instagram
                      </a>
                      <a 
                        href={SOCIAL_LINKS.audius} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-xs px-2 py-1 border border-soft-green text-soft-green hover:bg-soft-green/10 transition-colors"
                      >
                        Audius
                      </a>
                      <a 
                        href={SOCIAL_LINKS.email} 
                        className="text-xs px-2 py-1 border border-soft-green text-soft-green hover:bg-soft-green/10 transition-colors"
                      >
                        Email
                      </a>
                    </div>
                  </>
                ) : (
                  <div className="pl-4">
                    <div className="text-yellow-400 mb-2">⚠ Iframe failed to load</div>
                    <div className="text-gray-400 text-xs mb-2">
                      Direct link: <a href={SOCIAL_LINKS.soundcloud} target="_blank" rel="noopener noreferrer" className="text-soft-green hover:underline">SoundCloud</a>
                    </div>
                    <div className="flex gap-2 mb-2 flex-wrap">
                      <a 
                        href={SOCIAL_LINKS.bandcamp} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-xs px-2 py-1 border border-soft-green text-soft-green hover:bg-soft-green/10 transition-colors"
                      >
                        Bandcamp
                      </a>
                      <a 
                        href={SOCIAL_LINKS.instagram} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-xs px-2 py-1 border border-soft-green text-soft-green hover:bg-soft-green/10 transition-colors"
                      >
                        Instagram
                      </a>
                      <a 
                        href={SOCIAL_LINKS.audius} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-xs px-2 py-1 border border-soft-green text-soft-green hover:bg-soft-green/10 transition-colors"
                      >
                        Audius
                      </a>
                      <a 
                        href={SOCIAL_LINKS.email} 
                        className="text-xs px-2 py-1 border border-soft-green text-soft-green hover:bg-soft-green/10 transition-colors"
                      >
                        Email
                      </a>
                    </div>
                    <button 
                      onClick={() => {
                        setIframeError(false);
                        setShowSoundCloud(true);
                      }}
                      className="text-xs px-2 py-1 border border-soft-green text-soft-green hover:bg-soft-green/10 transition-colors"
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>
            )}
            {!showSoundCloud && (
              <div className="pl-4">
                <div className="text-gray-400 text-xs">
                  Type <span className="text-soft-green">soundcloud</span> or <span className="text-soft-green">sc</span> to load player
                </div>
              </div>
            )}
            <div className="text-cyan-400">└──────────────────────────────────┘</div>
          </div>
        );
      case "about":
        return (
          <div className="flex flex-col gap-2">
            <div className="text-cyan-400">┌─ About ──────────────────────────┐</div>
            <div className="pl-4">
              <div className="text-yellow-400 mb-2">Citizen Science</div>
              <div className="text-gray-300">
                Sonic meditations. Oscillating the mind with sound...
              </div>
            </div>
            <div className="text-cyan-400">└──────────────────────────────────┘</div>
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <div 
      className="h-screen w-screen bg-black text-soft-green font-mono text-sm overflow-hidden flex flex-col"
      onClick={() => inputRef.current?.focus()}
    >
      {/* Header */}
      <div className="border-b border-soft-green/30 px-2 py-1 flex items-center justify-between bg-black/50">
        <div className="flex items-center gap-4">
          <span className="text-soft-green">citizen-science</span>
          <span className="text-gray-600">|</span>
          <span className="text-gray-500 text-xs">
            View: <span className="text-cyan-400">{currentView}</span>
          </span>
        </div>
        <div className="text-xs text-gray-600">
          Tab: switch view | ↑/↓: history | Esc: clear | Ctrl+L: clear output
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-auto p-2 relative">
        {/* View panel */}
        {currentView !== "main" && (
          <div className="mb-4">
            {renderView()}
          </div>
        )}

        {/* Command output */}
        <div className="space-y-1">
          {output.length === 0 && (
            <div className="text-gray-600">
              Welcome to Citizen Science CLI
              <br />
              Type <span className="text-soft-green">help</span> to get started.
            </div>
          )}
          {output.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap">
              {line}
            </div>
          ))}
          <div ref={outputRef} />
        </div>
      </div>

      {/* Command input */}
      <div className="border-t border-soft-green/30 px-2 py-1 bg-black/50 flex items-center gap-2">
        <span className="text-soft-green">$</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="bg-transparent outline-none flex-1 text-soft-green caret-soft-green"
          placeholder="type a command..."
          autoFocus
        />
        <span className="text-gray-600 text-xs">
          [{currentView}]
        </span>
      </div>
    </div>
  );
}
