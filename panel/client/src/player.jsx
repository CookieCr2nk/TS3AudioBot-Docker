import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "./auth.jsx";

const PlayerContext = createContext(null);

export function PlayerProvider({ value, children }) {
  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  return useContext(PlayerContext);
}

// Keys that move a range input. A key press commits the new value when the key is released.
const RANGE_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);

function clock(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return "0:00";
  const total = Math.floor(number);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const sec = String(seconds).padStart(2, "0");
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${sec}`;
  return `${minutes}:${sec}`;
}

export function PlayerBar() {
  const player = usePlayer();
  const { t } = useAuth();
  const [volume, setVolume] = useState(50);
  const [position, setPosition] = useState(0);
  // True only while the pointer or a key is held on that slider. Focus alone no longer stops the updates.
  const seekHeld = useRef(false);
  const volumeHeld = useRef(false);
  const bot = player?.bot;
  const song = player?.status?.song;
  const playing = Boolean(song && song.paused === false);
  const title = player?.status?.unreachable
    ? t("Status unreachable")
    : player?.status?.online === false
      ? t("Offline")
      : song?.title || t("Nothing is playing.");

  useEffect(() => {
    setVolume(50);
    setPosition(0);
  }, [bot?.id]);

  useEffect(() => {
    if (volumeHeld.current) return;
    if (player?.status?.volume != null) setVolume(player.status.volume);
  }, [player?.status?.volume, bot?.id]);

  useEffect(() => {
    if (seekHeld.current) return;
    if (song?.position != null) setPosition(song.position);
  }, [song?.position, bot?.id]);

  if (!bot || !player) return null;

  // Controls do nothing while the bot API cannot be reached or the bot is not on a server.
  const live = Boolean(player.canControl && !player.status?.unreachable && player.status?.online !== false);
  const canSeek = Boolean(live && song?.length);

  return (
    <section className="player" aria-label={t("Playback")}>
      <div className="player-track">
        <Link className="player-title" to={`/bots/${bot.id}`}>{title}</Link>
        <p className="player-meta">
          <Link to={`/bots/${bot.id}`}>{bot.name}</Link>
          {bot.instanceName ? <span> · {bot.instanceName}</span> : null}
          {song?.source ? <span className="player-source"> · {song.source}</span> : null}
        </p>
        {!player.canControl ? <p className="player-note">{t("Read only")}</p> : null}
      </div>
      <div className="player-center">
        <div className="player-buttons">
          <button className="btn player-icon" type="button" aria-label={t("Previous")} disabled={!live} onClick={() => player.act({ op: "previous" })}>⏮</button>
          <button
            className="btn btn-primary player-play"
            type="button"
            aria-label={playing ? t("Pause") : t("Resume")}
            disabled={!live}
            onClick={() => player.act({ op: playing ? "pause" : "resume" })}
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <button className="btn player-icon" type="button" aria-label={t("Skip")} disabled={!live} onClick={() => player.act({ op: "next" })}>⏭</button>
        </div>
        <div className="player-seek">
          <span className="mono">{song ? clock(position) : "0:00"}</span>
          <input
            type="range"
            min="0"
            max={song?.length || 0}
            step="1"
            value={Math.min(position, song?.length || 0)}
            disabled={!canSeek}
            aria-label={t("Position")}
            onChange={(event) => setPosition(Number(event.target.value))}
            onPointerDown={(event) => {
              seekHeld.current = true;
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerUp={(event) => {
              seekHeld.current = false;
              if (canSeek) player.act({ op: "seek", seconds: Math.floor(Number(event.currentTarget.value)) });
            }}
            onPointerCancel={() => { seekHeld.current = false; }}
            onBlur={() => { seekHeld.current = false; }}
            onKeyDown={(event) => {
              if (RANGE_KEYS.has(event.key)) seekHeld.current = true;
            }}
            onKeyUp={(event) => {
              if (!RANGE_KEYS.has(event.key)) return;
              seekHeld.current = false;
              if (canSeek) player.act({ op: "seek", seconds: Math.floor(Number(event.currentTarget.value)) });
            }}
          />
          <span className="mono">{song?.lengthLabel || "--:--"}</span>
        </div>
      </div>
      <label className="player-volume">
        <span className="visually-hidden">{t("Volume")}</span>
        <input
          type="range"
          min="0"
          max="100"
          value={volume}
          disabled={!live}
          aria-label={t("Volume")}
          onChange={(event) => setVolume(Number(event.target.value))}
          onPointerDown={(event) => {
            volumeHeld.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={(event) => {
            volumeHeld.current = false;
            player.act({ op: "volume", volume: Number(event.currentTarget.value) });
          }}
          onPointerCancel={() => { volumeHeld.current = false; }}
          onBlur={() => { volumeHeld.current = false; }}
          onKeyDown={(event) => {
            if (RANGE_KEYS.has(event.key)) volumeHeld.current = true;
          }}
          onKeyUp={(event) => {
            if (!RANGE_KEYS.has(event.key)) return;
            volumeHeld.current = false;
            player.act({ op: "volume", volume: Number(event.currentTarget.value) });
          }}
        />
      </label>
    </section>
  );
}
