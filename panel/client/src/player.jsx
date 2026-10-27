import { createContext, useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "./auth.jsx";

const PlayerContext = createContext(null);

export function PlayerProvider({ value, children }) {
  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  return useContext(PlayerContext);
}

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
  const bot = player?.bot;
  const song = player?.status?.song;
  const playing = Boolean(song && song.paused === false);

  useEffect(() => {
    setVolume(50);
    setPosition(0);
  }, [bot?.id]);

  useEffect(() => {
    if (document.activeElement?.dataset?.volume === "1") return;
    if (player?.status?.volume != null) setVolume(player.status.volume);
  }, [player?.status?.volume, bot?.id]);

  useEffect(() => {
    if (document.activeElement?.dataset?.seek === "1") return;
    if (song?.position != null) setPosition(song.position);
  }, [song?.position, bot?.id]);

  if (!bot || !player) return null;

  const canSeek = Boolean(player.canControl && song?.length);
  const problem = player.status?.problems?.[0];

  return (
    <section className="player" aria-label={t("Playback")}>
      <div className="player-track">
        <Link className="player-title" to={`/bots/${bot.id}`}>{song?.title || t("Nothing is playing.")}</Link>
        <p className="player-meta">
          <Link to={`/bots/${bot.id}`}>{bot.name}</Link>
          {bot.instanceName ? <span> · {bot.instanceName}</span> : null}
          {song?.source ? <span className="player-source"> · {song.source}</span> : null}
        </p>
        {player.error ? <p className="player-note bad" role="alert">{player.error}</p> : null}
        {!player.error && player.note ? <p className="player-note" role="status">{player.note}</p> : null}
        {!player.error && !player.note && problem ? <p className="player-note bad">{problem}</p> : null}
        {!player.error && !player.note && !problem && !player.canControl ? <p className="player-note">{t("Read only")}</p> : null}
      </div>
      <div className="player-center">
        <div className="player-buttons">
          <button className="btn player-icon" type="button" aria-label={t("Previous")} disabled={!player.canControl} onClick={() => player.act({ op: "previous" })}>⏮</button>
          <button
            className="btn btn-primary player-play"
            type="button"
            aria-label={playing ? t("Pause") : t("Resume")}
            disabled={!player.canControl}
            onClick={() => player.act({ op: playing ? "pause" : "resume" })}
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <button className="btn player-icon" type="button" aria-label={t("Skip")} disabled={!player.canControl} onClick={() => player.act({ op: "next" })}>⏭</button>
        </div>
        <div className="player-seek">
          <span className="mono">{song ? clock(position) : "0:00"}</span>
          <input
            data-seek="1"
            type="range"
            min="0"
            max={song?.length || 0}
            step="1"
            value={Math.min(position, song?.length || 0)}
            disabled={!canSeek}
            aria-label={t("Position")}
            onChange={(event) => setPosition(Number(event.target.value))}
            onPointerUp={(event) => {
              if (canSeek) player.act({ op: "seek", seconds: Math.floor(Number(event.currentTarget.value)) });
            }}
            onKeyUp={(event) => {
              if (canSeek && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                player.act({ op: "seek", seconds: Math.floor(Number(event.currentTarget.value)) });
              }
            }}
          />
          <span className="mono">{song?.lengthLabel || "--:--"}</span>
        </div>
      </div>
      <label className="player-volume">
        <span className="visually-hidden">{t("Volume")}</span>
        <input
          data-volume="1"
          type="range"
          min="0"
          max="100"
          value={volume}
          disabled={!player.canControl}
          aria-label={t("Volume")}
          onChange={(event) => setVolume(Number(event.target.value))}
          onPointerUp={(event) => player.act({ op: "volume", volume: Number(event.currentTarget.value) })}
          onKeyUp={(event) => {
            if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
              player.act({ op: "volume", volume: Number(event.currentTarget.value) });
            }
          }}
        />
      </label>
    </section>
  );
}
