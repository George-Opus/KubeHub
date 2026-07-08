"use client";

import { useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "xterm";
import "xterm/css/xterm.css";

type Props = {
  wsUrl: string;
  interactive: boolean;
};

const TERM_THEME = {
  background: "#0a0f1c",
  foreground: "#cddcf2",
  cursor: "#4d9dff",
  selectionBackground: "#1e3a5f",
};

export function PodTerminal({ wsUrl, interactive }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      cursorBlink: interactive,
      fontFamily: "var(--font-mono), monospace",
      fontSize: 13,
      theme: TERM_THEME,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    const ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      if (interactive) ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    };
    ws.onmessage = (e) => term.write(typeof e.data === "string" ? e.data : "");
    ws.onclose = () => term.writeln("\r\n\x1b[90m[connexion fermée]\x1b[0m");
    ws.onerror = () => term.writeln("\r\n\x1b[31m[erreur de connexion]\x1b[0m");

    if (interactive) {
      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "input", data }));
      });
    }

    const onResize = () => {
      fit.fit();
      if (interactive && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      ws.close();
      term.dispose();
    };
  }, [wsUrl, interactive]);

  return <div ref={containerRef} className="h-full w-full overflow-hidden rounded-lg bg-[#0a0f1c]" />;
}
