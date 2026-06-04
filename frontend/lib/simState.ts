"use client";

/**
 * Shared simulator-state store.
 *
 * The simulator's running state is shown and controlled from several places
 * (Scenario Controls, the Live Event Feed header, and the fleet page's polling
 * gate). Keeping a separate copy in each component lets them drift out of sync
 * (one panel says "running" while another says "stopped"). This module is the
 * single source of truth: components subscribe, control actions update everyone
 * immediately, and one shared poll reconciles with the backend.
 */
import { api } from "./api";

type Listener = (running: boolean | null) => void;

let running: boolean | null = null;
const listeners = new Set<Listener>();
let subscriberCount = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function emit() {
  listeners.forEach((l) => l(running));
}

export function getSimRunning(): boolean | null {
  return running;
}

export async function refreshSimState(): Promise<void> {
  try {
    const s = await api.demo.state();
    if (s.simulator_running !== running) {
      running = s.simulator_running;
      emit();
    }
  } catch {
    /* leave last-known state in place */
  }
}

export function setSimRunning(next: boolean) {
  if (running !== next) {
    running = next;
    emit();
  }
}

export async function controlSim(action: "start" | "stop" | "restart"): Promise<boolean> {
  const res = await api.demo.simulator(action);
  setSimRunning(res.running);
  return res.running;
}

export function subscribeSimState(listener: Listener): () => void {
  listeners.add(listener);
  listener(running);
  if (++subscriberCount === 1) {
    refreshSimState();
    pollTimer = setInterval(refreshSimState, 5000);
  }
  return () => {
    listeners.delete(listener);
    if (--subscriberCount === 0 && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };
}
