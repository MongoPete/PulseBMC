"use client";

/**
 * Shared Server-Sent Events client.
 *
 * The browser caps concurrent HTTP/1.1 connections per host (~6). Each open
 * EventSource holds one of those slots for its entire lifetime, so opening a
 * separate stream per component (fleet grid + live feed + device + alerts)
 * quickly starves regular fetches and the UI hangs on "loading". This module
 * multiplexes every subscriber onto a SINGLE EventSource per browser tab.
 */
import { SSE_URL } from "./api";

export interface LivePayload {
  connected?: boolean;
  device_id?: string;
  led_state?: string;
  status?: string;
  event_type?: string;
  message?: string;
}

type MessageListener = (payload: LivePayload) => void;
type StatusListener = (connected: boolean) => void;

let es: EventSource | null = null;
let connected = false;
const messageListeners = new Set<MessageListener>();
const statusListeners = new Set<StatusListener>();

function open() {
  if (es || typeof window === "undefined") return;
  es = new EventSource(SSE_URL);
  es.onopen = () => {
    connected = true;
    statusListeners.forEach((l) => l(true));
  };
  es.onerror = () => {
    connected = false;
    statusListeners.forEach((l) => l(false));
  };
  es.onmessage = (e) => {
    let payload: LivePayload;
    try {
      payload = JSON.parse(e.data);
    } catch {
      return;
    }
    messageListeners.forEach((l) => l(payload));
  };
}

function maybeClose() {
  if (messageListeners.size === 0 && statusListeners.size === 0 && es) {
    es.close();
    es = null;
    connected = false;
  }
}

export function subscribeLiveMessages(listener: MessageListener): () => void {
  messageListeners.add(listener);
  open();
  return () => {
    messageListeners.delete(listener);
    maybeClose();
  };
}

export function subscribeLiveStatus(listener: StatusListener): () => void {
  statusListeners.add(listener);
  open();
  listener(connected);
  return () => {
    statusListeners.delete(listener);
    maybeClose();
  };
}
