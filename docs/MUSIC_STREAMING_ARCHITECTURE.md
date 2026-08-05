# Music Streaming Architecture

This app does not stream one live audio feed from the server to every user. It uses synchronized client-side playback:

- the backend stores the authoritative playback state for each music room;
- playback changes are sent as small websocket events;
- each browser loads the same Google Drive track into its own hidden `<audio>` element;
- each browser keeps its local audio position aligned to the server-stamped playback state.

This keeps bandwidth low and avoids holding backend connections open for every listener except when a browser is actually fetching audio bytes.

## Main Pieces

Backend:

- `backend/app/modules/music/models.py`
  - `MusicChannel`: the listening room.
  - `MusicChannelMember`: room membership and `can_control` permission.
  - `MusicPlaybackState`: one authoritative playback-state row per room.
  - `DriveConnection`: encrypted Google Drive refresh token for private folders.
- `backend/app/modules/music/service.py`
  - room membership/control checks;
  - playback command handling;
  - websocket event broadcasting;
  - Google Drive folder playlist loading;
  - signed stream URL issuing;
  - cache-backed track streaming.
- `backend/app/modules/music/router.py`
  - REST endpoints for channels, members, playback, Drive, stream URLs, and raw audio streaming.
- `backend/app/modules/music/cache.py`
  - MinIO-backed byte cache for Drive tracks.

Frontend:

- `frontend/src/components/music/MusicPlayerProvider.tsx`
  - owns the single hidden `<audio>` element for the whole app;
  - opens active music rooms;
  - receives websocket sync frames;
  - requests signed stream URLs;
  - reconciles local playback drift.
- `frontend/src/components/music/MusicChannelView.tsx`
  - room UI, now-playing controls, playlist, Drive folder picker, member control.
- `frontend/src/components/chat/ChatPanel.tsx`
  - embeds music rooms inside the chat drawer and listens for lobby updates.
- `frontend/src/lib/api/music.ts`
  - typed client wrappers around the music REST API.

## Room And Permission Model

A music room is a `MusicChannel`. Users with `music.access` can see rooms and join them. Joining creates a `MusicChannelMember` row.

The channel owner always has playback control. Other members can listen, but can only control transport if the owner grants `can_control`.

Control-gated actions:

- play
- pause
- seek
- next
- previous
- set track

Listening is separate from control. A listener can receive sync events and stream audio without being allowed to send playback commands.

## Playback State

The authoritative state is `MusicPlaybackState`:

- `playlist`: snapshot of Drive track metadata
- `track_index`: current track
- `is_playing`: transport state
- `position_seconds`: position at the moment the state was stamped
- `server_epoch_ms`: server timestamp for that position

When a track is playing, the current expected position is:

```text
position_seconds + (now_ms - server_epoch_ms) / 1000
```

The backend uses this formula when applying new commands. The frontend uses the same idea, corrected by `server_now_ms`, so client clock drift does not make the UI jump.

## Realtime Sync Flow

1. A controller clicks play/pause/seek/next/etc.
2. The frontend sends `POST /music/channels/{channel_id}/playback`.
3. The backend validates room membership and control permission.
4. The backend updates `MusicPlaybackState`.
5. The backend broadcasts a `music.playback` websocket event to `music:{channel_id}`.
6. Every joined client receives the same tiny sync frame.
7. Each browser reconciles its hidden `<audio>` element to the expected position.

The websocket group join is membership-gated in `backend/app/main.py`; clients cannot join `music:{channel_id}` unless `music.service.is_member` returns true.

There is also a public-ish lobby metadata group, `music-lobby`, used for sidebar state like "now playing". It does not carry audio bytes or private room playback control.

## Audio Byte Flow

The backend does not push audio over websocket.

Instead:

1. `MusicPlayerProvider` sees the current `track.id`.
2. It calls `GET /music/channels/{channel_id}/tracks/{file_id}/stream-url`.
3. The backend validates membership and returns a short-lived signed URL.
4. The browser sets that URL as the hidden `<audio src>`.
5. The browser fetches bytes from `GET /music/tracks/{file_id}/stream?token=...`.
6. The stream endpoint validates the signed token, finds the track in the room playlist, and returns a `StreamingResponse`.

The stream endpoint intentionally does not use the normal request DB dependency because a long audio response would hold a DB connection for minutes. The service opens a short-lived session only for token/state validation, then streams sessionless.

## Google Drive Source

Owners select a Google Drive folder as the room playlist source.

The app supports:

- public Drive folders, without OAuth;
- private folders, if the owner connects Google Drive.

Private Drive connections store the refresh token encrypted at rest in `DriveConnection`.

When a folder is selected:

1. backend lists audio files from Drive;
2. stores the track metadata snapshot in `MusicPlaybackState.playlist`;
3. resets playback to track 0, paused;
4. broadcasts `music.playlist` so listeners refresh full state.

## Cache Strategy

`backend/app/modules/music/cache.py` implements a MinIO-backed byte cache.

Purpose:

- avoid one Google Drive fetch per listener;
- serve Range requests reliably;
- give browsers stable duration/seek behavior;
- reduce Drive pressure during group listening.

On stream request:

1. backend checks the cache for the file id;
2. on hit, serves from MinIO with Range support;
3. on miss, starts a single-flight background cache fill;
4. the current listener streams through directly from Drive while the fill runs.

Playback commands also prewarm the current and next track after state changes.

## Frontend Recovery Behavior

`MusicPlayerProvider` handles common browser/audio failure cases:

- autoplay blocked: shows a "tap to start listening" affordance;
- signed URL expired or stream dropped: reissues a stream URL with exponential backoff;
- drift: hard-seeks only when local audio differs from expected position by more than `DRIFT_TOLERANCE_S`;
- late join: fetches current state and reconciles immediately.

The hidden `<audio>` element lives in `MusicPlayerProvider`, which wraps the app layout. That means audio can continue while the chat drawer collapses or the user navigates within the app.

## End-To-End Summary

The system is best described as:

```text
REST command -> persisted room state -> websocket sync frame -> local audio reconciliation
signed stream URL -> backend proxy/cache -> Google Drive bytes
```

This gives users a shared listening-room experience without running a server-side live audio mixer or websocket audio broadcast.
