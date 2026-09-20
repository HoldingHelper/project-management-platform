"use client";

/* Global synchronized music player.

   One hidden <audio> element for the whole app (survives sidebar collapse and
   route changes). The server is the single source of truth: transport changes
   arrive as tiny `music.playback` frames over the shared websocket, stamped
   with the server clock. Each client plays the Drive-backed track itself and
   reconciles its <audio>.currentTime against

       expected = position_seconds + (serverNow - server_epoch_ms) / 1000

   where serverNow is the client clock corrected by the offset observed from
   `server_now_ms` on every state/frame receipt (raw Date.now() drifts against
   the server and used to make the progress bar jump).

   Drift is corrected in stages: tiny drift is ignored, medium drift glides via
   a small playbackRate nudge, only large drift hard-seeks — so listeners don't
   hear micro-seeks. Stream URLs are signed and can expire / the proxy can drop:
   any <audio> error or hard stall re-issues the URL and reloads at the synced
   position with exponential backoff, so listeners never need a page refresh. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  getPlaybackState,
  getStreamUrl,
  sendPlaybackCommand,
} from "@/lib/api/music";
import { useRealtimeEvent } from "@/lib/ws/RealtimeProvider";
import type {
  MusicChannelListItem,
  PlaybackAction,
  PlaybackState,
} from "@/lib/types";

/* Staged drift correction (Plan Phase 10). Below SMALL we do nothing so the
   player never micro-seeks. Between SMALL and LARGE we nudge playbackRate to
   glide back into sync inaudibly. Beyond LARGE we hard-seek. Tuning params —
   adjust from real device measurements. */
const DRIFT_SMALL_S = 0.2;
const DRIFT_LARGE_S = 1.0;
/** playbackRate nudge for medium drift (±5%). */
const RATE_NUDGE = 0.05;
/** Periodic reconcile cadence while playing. */
const RECONCILE_INTERVAL_MS = 5_000;
/** Stream-recovery backoff: 1s, 2s, 4s, then surface a reconnect button. */
const MAX_RECOVERY_ATTEMPTS = 3;
const RECOVERY_BASE_DELAY_MS = 1_000;

/* Client-vs-server clock offset (ms). Rather than trust a single `server_now_ms`
   sample (one high-RTT packet skews the whole progress bar), we keep a small
   ring of recent samples and use their median. Module-level so
   `usePlaybackPosition` shares the same corrected clock. */
const CLOCK_SAMPLE_COUNT = 5;
const clockSamples: number[] = [];
let clockOffsetMs = 0;

function observeServerClock(serverNowMs?: number) {
  if (typeof serverNowMs !== "number" || serverNowMs <= 0) return;
  // Offset = local - server. Each receipt is one sample; median discards the
  // occasional high-latency outlier.
  clockSamples.push(Date.now() - serverNowMs);
  if (clockSamples.length > CLOCK_SAMPLE_COUNT) clockSamples.shift();
  const sorted = [...clockSamples].sort((a, b) => a - b);
  clockOffsetMs = sorted[Math.floor(sorted.length / 2)];
}

function serverNow(): number {
  return Date.now() - clockOffsetMs;
}

function expectedPosition(state: PlaybackState): number {
  if (!state.is_playing) return state.position_seconds;
  return state.position_seconds + (serverNow() - state.server_epoch_ms) / 1000;
}

interface MusicPlayerApi {
  active: MusicChannelListItem | null;
  state: PlaybackState | null;
  canControl: boolean;
  /** True when the browser's autoplay policy blocked play() — needs a tap. */
  blocked: boolean;
  /** True after stream recovery gave up — show a reconnect affordance. */
  errored: boolean;
  volume: number;
  duration: number;
  shuffle: boolean;
  repeat: boolean;
  openChannel(item: MusicChannelListItem): void;
  closeChannel(): void;
  command(action: PlaybackAction, opts?: { position_seconds?: number; track_index?: number }): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  resume(): Promise<void>;
  /** Manual recovery after `errored` (re-issues the stream URL and resyncs). */
  reconnect(): Promise<void>;
  setVolume(v: number): void;
  setShuffle(v: boolean): void;
  setRepeat(v: boolean): void;
  refreshState(): Promise<void>;
}

const MusicPlayerContext = createContext<MusicPlayerApi | null>(null);

export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<MusicChannelListItem | null>(null);
  const [state, setState] = useState<PlaybackState | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [errored, setErrored] = useState(false);
  const [volume, setVolumeState] = useState(0.8);
  const [duration, setDuration] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stateRef = useRef<PlaybackState | null>(null);
  stateRef.current = state;
  const activeRef = useRef<MusicChannelListItem | null>(null);
  activeRef.current = active;
  const durationRef = useRef(0);
  durationRef.current = duration;
  // Which Drive file id the <audio> currently has loaded.
  const loadedTrackRef = useRef<string | null>(null);
  // Highest state_version applied. Any frame not strictly newer is dropped so
  // a stale/reordered websocket frame can never move playback backward.
  const appliedVersionRef = useRef<number>(-1);
  // Hard-seek counter (observability: how often we fall back to a jump).
  const hardCorrectionsRef = useRef(0);
  // Stream failure recovery bookkeeping.
  const recoveryAttemptsRef = useRef(0);
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canControl = active?.can_control ?? false;

  const applyState = useCallback((fresh: PlaybackState | null) => {
    if (fresh) {
      observeServerClock(fresh.server_now_ms);
      // A full-state fetch (REST / catch-up / reconnect) is authoritative:
      // adopt its version outright so subsequent frames compare against it.
      appliedVersionRef.current = fresh.state_version ?? appliedVersionRef.current;
    }
    setState(fresh);
  }, []);

  /** Expected position clamped so clock skew never seeks past the end. */
  const clampedExpected = useCallback((s: PlaybackState): number => {
    const expected = expectedPosition(s);
    const d = durationRef.current;
    if (d > 0) return Math.min(Math.max(0, expected), Math.max(0, d - 0.25));
    return Math.max(0, expected);
  }, []);

  /** Staged drift correction (Plan Phase 10): ignore tiny drift, glide medium
      drift via playbackRate, hard-seek only large drift. `force` always seeks
      (used when (re)starting playback at a fresh position). */
  const correctDrift = useCallback((audio: HTMLAudioElement, expected: number, force: boolean) => {
    const drift = audio.currentTime - expected;
    const abs = Math.abs(drift);
    if (force || abs > DRIFT_LARGE_S) {
      audio.currentTime = expected;
      audio.playbackRate = 1;
      if (!force) hardCorrectionsRef.current += 1;
    } else if (abs > DRIFT_SMALL_S) {
      // Behind (drift < 0) => speed up slightly; ahead => slow down.
      audio.playbackRate = drift < 0 ? 1 + RATE_NUDGE : 1 - RATE_NUDGE;
    } else {
      audio.playbackRate = 1;
    }
  }, []);

  const playLoadedAudio = useCallback(async (force = false) => {
    const audio = audioRef.current;
    const s = stateRef.current;
    if (!audio || !s?.track || loadedTrackRef.current !== s.track.id) return false;
    correctDrift(audio, clampedExpected(s), force);
    try {
      await audio.play();
      setBlocked(false);
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        setBlocked(true);
      } else {
        setBlocked(false);
        setErrored(true);
      }
      return false;
    }
  }, [clampedExpected, correctDrift]);

  /** Align the <audio> element with the authoritative state. */
  const reconcile = useCallback(() => {
    const audio = audioRef.current;
    const s = stateRef.current;
    if (!audio || !s || !s.track || loadedTrackRef.current !== s.track.id) return;
    if (s.is_playing) {
      correctDrift(audio, clampedExpected(s), false);
      if (audio.paused) void playLoadedAudio();
    } else {
      audio.playbackRate = 1;
      if (!audio.paused) {
        audio.pause();
        setBlocked(false);
      }
    }
  }, [clampedExpected, correctDrift, playLoadedAudio]);

  /** Load the current track's stream into the <audio> (then reconcile). */
  const loadTrack = useCallback(async () => {
    const audio = audioRef.current;
    const s = stateRef.current;
    const channel = activeRef.current;
    if (!audio || !s || !channel) return;
    if (!s.track) {
      loadedTrackRef.current = null;
      audio.removeAttribute("src");
      return;
    }
    if (loadedTrackRef.current === s.track.id) {
      reconcile();
      return;
    }
    const trackId = s.track.id;
    try {
      const { url } = await getStreamUrl(channel.channel.id, trackId);
      // State may have moved on while we fetched the signed URL.
      if (stateRef.current?.track?.id !== trackId) return;
      loadedTrackRef.current = trackId;
      audio.src = url;
      audio.load();
      setDuration(0);
    } catch {
      loadedTrackRef.current = null;
      setErrored(true);
    }
  }, [reconcile]);

  const clearRecoveryTimer = useCallback(() => {
    if (recoveryTimerRef.current) {
      clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = null;
    }
  }, []);

  /** Stream died (expired signed URL, dropped proxy, network blip): re-issue
      the URL and reload at the synced position, with backoff. */
  const recoverStream = useCallback(() => {
    const s = stateRef.current;
    const channel = activeRef.current;
    if (!s?.track || !channel) return;
    if (recoveryTimerRef.current) return; // one recovery in flight
    if (recoveryAttemptsRef.current >= MAX_RECOVERY_ATTEMPTS) {
      setErrored(true);
      return;
    }
    const attempt = recoveryAttemptsRef.current;
    recoveryAttemptsRef.current = attempt + 1;
    recoveryTimerRef.current = setTimeout(() => {
      recoveryTimerRef.current = null;
      // Force a fresh signed URL — the old one may be expired.
      loadedTrackRef.current = null;
      void loadTrack();
    }, RECOVERY_BASE_DELAY_MS * 2 ** attempt);
  }, [loadTrack]);

  /** Playback is healthy again: reset recovery bookkeeping. */
  const markHealthy = useCallback(() => {
    recoveryAttemptsRef.current = 0;
    clearRecoveryTimer();
    setErrored(false);
  }, [clearRecoveryTimer]);

  const refreshState = useCallback(async () => {
    const channel = activeRef.current;
    if (!channel) return;
    try {
      const fresh = await getPlaybackState(channel.channel.id);
      applyState(fresh);
    } catch {
      /* not a member yet / channel gone — view handles it */
    }
  }, [applyState]);

  // Live sync frames for the active channel (group join is automatic).
  useRealtimeEvent(
    ["music.playback", "music.playlist", "ws.reconnect"],
    (evt) => {
      const channel = activeRef.current;
      if (!channel) return;
      // Socket dropped and recovered: we may have missed frames, so refetch
      // the authoritative state instead of trusting our stale local copy.
      if (evt.event === "ws.reconnect") {
        void refreshState();
        return;
      }
      const channelId = (evt.data as { channel_id?: string }).channel_id;
      if (channelId !== channel.channel.id) return;
      if (evt.event === "music.playlist") {
        void refreshState();
        return;
      }
      // Merge the small frame into the full state (playlist is unchanged).
      const d = evt.data as unknown as {
        track_index: number;
        is_playing: boolean;
        position_seconds: number;
        server_epoch_ms: number;
        state_version?: number;
        server_now_ms?: number;
      };
      // Version guard: drop any frame that is not strictly newer than the last
      // applied. Stops a stale/reordered frame from rewinding playback.
      const v = d.state_version ?? -1;
      if (v <= appliedVersionRef.current) return;
      appliedVersionRef.current = v;
      observeServerClock(d.server_now_ms);
      setState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          track_index: d.track_index,
          track: prev.playlist[d.track_index] ?? null,
          is_playing: d.is_playing,
          position_seconds: d.position_seconds,
          server_epoch_ms: d.server_epoch_ms,
          state_version: v,
          server_now_ms: d.server_now_ms,
        };
      });
    },
    active ? [`music:${active.channel.id}`] : [],
  );

  // Whenever authoritative state changes: (re)load the track + reconcile.
  useEffect(() => {
    if (!state) return;
    void loadTrack();
    reconcile();
  }, [state, loadTrack, reconcile]);

  // Periodic drift correction while playing.
  useEffect(() => {
    if (!state?.is_playing) return;
    const timer = setInterval(reconcile, RECONCILE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [state?.is_playing, reconcile]);

  const command = useCallback(
    async (
      action: PlaybackAction,
      opts: { position_seconds?: number; track_index?: number } = {},
    ) => {
      const channel = activeRef.current;
      if (!channel) return;
      // The response is the authoritative frame; everyone (including this
      // controller) is driven by the same state.
      const next = await sendPlaybackCommand(channel.channel.id, { action, ...opts });
      applyState(next);
    },
    [applyState],
  );

  const randomTrackIndex = useCallback((s: PlaybackState): number => {
    if (s.playlist.length <= 1) return s.track_index;
    let next = s.track_index;
    while (next === s.track_index) {
      next = Math.floor(Math.random() * s.playlist.length);
    }
    return next;
  }, []);

  const next = useCallback(async () => {
    const s = stateRef.current;
    if (!s || s.playlist.length === 0) return;
    if (shuffle) {
      await command("set_track", { track_index: randomTrackIndex(s) });
      return;
    }
    await command("next");
  }, [command, randomTrackIndex, shuffle]);

  const previous = useCallback(async () => {
    await command("prev");
  }, [command]);

  const openChannel = useCallback(
    (item: MusicChannelListItem) => {
      setActive(item);
      setState(null);
      setDuration(0);
      loadedTrackRef.current = null;
      appliedVersionRef.current = -1;
      markHealthy();
      // Fetch the catch-up state after `active` is set.
      void getPlaybackState(item.channel.id)
        .then(applyState)
        .catch(() => setState(null));
    },
    [applyState, markHealthy],
  );

  const closeChannel = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.playbackRate = 1;
      audio.removeAttribute("src");
    }
    loadedTrackRef.current = null;
    appliedVersionRef.current = -1;
    setActive(null);
    setState(null);
    setBlocked(false);
    setDuration(0);
    markHealthy();
  }, [markHealthy]);

  const resume = useCallback(async () => {
    const audio = audioRef.current;
    const s = stateRef.current;
    const channel = activeRef.current;
    if (!audio || !s?.track || !channel) return;

    if (loadedTrackRef.current !== s.track.id) {
      try {
        const { url } = await getStreamUrl(channel.channel.id, s.track.id);
        if (stateRef.current?.track?.id !== s.track.id) return;
        loadedTrackRef.current = s.track.id;
        audio.src = url;
        audio.load();
      } catch {
        setBlocked(false);
        setErrored(true);
        return;
      }
    }

    await playLoadedAudio(true);
  }, [playLoadedAudio]);

  /** Manual recovery after backoff gave up: fresh state + fresh stream URL. */
  const reconnect = useCallback(async () => {
    markHealthy();
    loadedTrackRef.current = null;
    await refreshState();
    await loadTrack();
  }, [markHealthy, refreshState, loadTrack]);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.min(1, Math.max(0, v));
    setVolumeState(clamped);
    if (audioRef.current) audioRef.current.volume = clamped;
  }, []);

  // Track ended: a controller's client advances the room; listeners wait for
  // the resulting `music.playback` frame.
  const onEnded = useCallback(() => {
    const channel = activeRef.current;
    const s = stateRef.current;
    if (!channel || !s) return;
    if (channel.can_control && s.playlist.length > 0) {
      if (repeat) {
        void command("play", { track_index: s.track_index, position_seconds: 0 }).catch(() => undefined);
      } else {
        void next().catch(() => undefined);
      }
    }
  }, [command, next, repeat]);

  const onAudioError = useCallback(() => {
    const audio = audioRef.current;
    // Clearing `src` on close also fires an error event — ignore those.
    if (!audio || !audio.currentSrc || !stateRef.current?.track) return;
    recoverStream();
  }, [recoverStream]);

  const onCanPlay = useCallback(() => {
    markHealthy();
    reconcile();
  }, [markHealthy, reconcile]);

  const api = useMemo<MusicPlayerApi>(
    () => ({
      active,
      state,
      canControl,
      blocked,
      errored,
      volume,
      duration,
      shuffle,
      repeat,
      openChannel,
      closeChannel,
      command,
      next,
      previous,
      resume,
      reconnect,
      setVolume,
      setShuffle,
      setRepeat,
      refreshState,
    }),
    [active, state, canControl, blocked, errored, volume, duration, shuffle, repeat, openChannel, closeChannel, command, next, previous, resume, reconnect, setVolume, refreshState],
  );

  return (
    <MusicPlayerContext.Provider value={api}>
      {children}
      <audio
        ref={(el) => {
          audioRef.current = el;
          if (el) el.volume = volume;
        }}
        onCanPlay={onCanPlay}
        onError={onAudioError}
        onStalled={onAudioError}
        onLoadedMetadata={(e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
        onEnded={onEnded}
        style={{ display: "none" }}
      />
    </MusicPlayerContext.Provider>
  );
}

export function useMusicPlayer(): MusicPlayerApi {
  const ctx = useContext(MusicPlayerContext);
  if (!ctx) throw new Error("useMusicPlayer must be used inside MusicPlayerProvider");
  return ctx;
}

/** Convenience: live position for progress UIs (rerenders ~1/s while playing).
    Clamped to the known duration so the readout never overshoots the end. */
export function usePlaybackPosition(): number {
  const { state, duration } = useMusicPlayer();
  const [pos, setPos] = useState(0);
  useEffect(() => {
    if (!state) return;
    const tick = () => {
      const raw = expectedPosition(state);
      setPos(duration > 0 ? Math.min(raw, duration) : raw);
    };
    tick();
    if (!state.is_playing) return;
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [state, duration]);
  return pos;
}
