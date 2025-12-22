"use client";
import React, { useState, useEffect, useRef } from "react";

type View = "main" | "player" | "gigs" | "about";
type PlayerType = "bandcamp" | "soundcloud" | null;

export default function CLIStyleApp() {
  const [currentView, setCurrentView] = useState<View>("main");
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [input, setInput] = useState("");
  const [output, setOutput] = useState<string[]>([]);
  const [playing, setPlaying] = useState(false);
  const [visuals, setVisuals] = useState(true);
  const [activePlayer, setActivePlayer] = useState<PlayerType>(null);
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
        const views: View[] = ["main", "player", "gigs", "about"];
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
          "  bandcamp, bc     - Show Bandcamp player",
          "  soundcloud, sc   - Show SoundCloud player",
          "  gigs, g          - Show upcoming gigs",
          "  about, a         - About Citizen Science",
          "  visuals, v       - Toggle visuals",
          "  clear, c         - Clear screen",
          "",
          "Navigation:",
          "  Tab              - Switch views",
          "  ↑/↓              - Navigate command history",
          "  Esc              - Clear input",
          "  Ctrl+L           - Clear output",
        ]);
      } else if (trimmed === "bandcamp" || trimmed === "bc") {
        setActivePlayer("bandcamp");
        setCurrentView("player");
        setIframeError(false);
        addOutput("Loading Bandcamp player...");
      } else if (trimmed === "soundcloud" || trimmed === "sc") {
        setActivePlayer("soundcloud");
        setCurrentView("player");
        setIframeError(false);
        addOutput("Loading SoundCloud player...");
      } else if (trimmed === "play" || trimmed === "p") {
        setPlaying(true);
        addOutput("▶ Now playing: Pulse Sequence — Citizen Science");
      } else if (trimmed === "pause") {
        setPlaying(false);
        addOutput("⏸ Paused");
      } else if (trimmed === "gigs" || trimmed === "g") {
        addOutput([
          "Upcoming gigs:",
          "  2026-01-15  R1, Berlin",
          "  2026-02-12  LOFT, Munich",
          "  2026-03-20  Tresor, Berlin",
        ]);
      } else if (trimmed === "about" || trimmed === "a") {
        addOutput([
          "Citizen Science",
          "Hypnotic techno. Live performances, sample packs, and experimental synth work.",
          "",
          "Press Tab to navigate between views.",
        ]);
      } else if (trimmed === "visuals" || trimmed === "v") {
        setVisuals((v) => !v);
        addOutput(`Visuals: ${visuals ? "off" : "on"}`);
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
      case "player":
        return (
          <div className="flex flex-col gap-2">
            <div className="text-cyan-400">┌─ Player ─────────────────────────┐</div>
            {activePlayer === "bandcamp" && (
              <div className="pl-2 pr-2 pb-2">
                <div className="terminal-iframe-wrapper">
                  <div className="terminal-iframe-container">
                    <iframe
                      style={{ border: 0, width: "100%", height: "120px" }}
                      src="https://bandcamp.com/EmbeddedPlayer/track=YOUR_TRACK_ID/size=large/bgcol=000000/linkcol=00ff00/tracklist=false/artwork=small/transparent=true/"
                      seamless
                      title="Bandcamp Player"
                    />
                  </div>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Tip: Replace YOUR_TRACK_ID with your Bandcamp track ID. Use bgcol=000000 and linkcol=00ff00 for terminal theme.
                </div>
              </div>
            )}
            {activePlayer === "soundcloud" && (
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
                          src="https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/soundcloud%3Atracks%3A1779251895%3Fsecret_token%3Ds-cA3kVlCGbrK&color=%2300ff00&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true&visual=true"
                          title="SoundCloud Player - The Vision"
                          onLoad={() => setIframeError(false)}
                          onError={() => setIframeError(true)}
                        />
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Playing: The Vision — Citizen Science
                    </div>
                  </>
                ) : (
                  <div className="pl-4">
                    <div className="text-yellow-400 mb-2">⚠ Iframe failed to load</div>
                    <div className="text-gray-400 text-xs mb-2">
                      Direct link: <a href="https://soundcloud.com/citizen-science-268058692/the-vision" target="_blank" rel="noopener noreferrer" className="text-green-400 hover:underline">https://soundcloud.com/citizen-science-268058692/the-vision</a>
                    </div>
                    <button 
                      onClick={() => setIframeError(false)}
                      className="text-xs px-2 py-1 border border-green-800 text-green-400 hover:bg-green-400/10"
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>
            )}
            {!activePlayer && (
              <div className="pl-4">
                <div className="text-yellow-400">Pulse Sequence</div>
                <div className="text-gray-400">Citizen Science</div>
                <div className="mt-2 text-sm">
                  Status: <span className={playing ? "text-green-400" : "text-gray-500"}>{playing ? "▶ Playing" : "⏸ Paused"}</span>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  Type <span className="text-green-400">bandcamp</span> or <span className="text-green-400">soundcloud</span> to load a player
                </div>
              </div>
            )}
            <div className="text-cyan-400">└──────────────────────────────────┘</div>
          </div>
        );
      case "gigs":
        return (
          <div className="flex flex-col gap-2">
            <div className="text-cyan-400">┌─ Upcoming Gigs ──────────────────┐</div>
            <div className="pl-4 space-y-1">
              <div>2026-01-15  <span className="text-yellow-400">R1</span>, Berlin</div>
              <div>2026-02-12  <span className="text-yellow-400">LOFT</span>, Munich</div>
              <div>2026-03-20  <span className="text-yellow-400">Tresor</span>, Berlin</div>
            </div>
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
      className="h-screen w-screen bg-black text-green-400 font-mono text-sm overflow-hidden flex flex-col"
      onClick={() => inputRef.current?.focus()}
    >
      {/* Header */}
      <div className="border-b border-green-800 px-2 py-1 flex items-center justify-between bg-black/50">
        <div className="flex items-center gap-4">
          <span className="text-green-500">citizen-science</span>
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
              Type <span className="text-green-400">help</span> to get started.
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
      <div className="border-t border-green-800 px-2 py-1 bg-black/50 flex items-center gap-2">
        <span className="text-green-500">$</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="bg-transparent outline-none flex-1 text-green-400 caret-green-500"
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
