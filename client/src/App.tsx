import { type FormEvent, useState } from "react";
import { CARDS, type CardId, dealSummary, SPECIAL_CARDS, SPECIAL_RULES } from "../../shared/cards";
import type { LobbyView } from "../../shared/protocol";
import { MAX_NAME_LENGTH } from "../../shared/rules";
import { CardBack, CardFace, InfluenceCoin } from "./CardArt";
import { type Connection, useConnection } from "./connection";
import { GameScreen } from "./Game";
import { codeFromUrl, copyText, lobbyLink } from "./lobbyLink";
import { loadName, saveName } from "./session";

const params = new URLSearchParams(location.search);
const RULES_URL = "https://github.com/Nathan-Carpenter-Git/boom-boom-busta/blob/main/RULES.md";

export function App() {
  const conn = useConnection();
  if (params.has("cards")) return <CardGallery />;
  return (
    <main className="app">
      {conn.status !== "open" && <ConnectionBanner waking={conn.status === "waking"} />}
      {conn.error && (
        <button type="button" className="toast" onClick={conn.clearError}>
          {conn.error}
        </button>
      )}
      {conn.lobby?.game && conn.lobby.you && conn.playerId ? (
        <GameScreen
          conn={conn}
          lobby={conn.lobby}
          game={conn.lobby.game}
          me={conn.playerId}
          card={conn.lobby.you.card}
          team={conn.lobby.you.team}
          room={conn.lobby.you.room}
        />
      ) : conn.lobby && conn.playerId ? (
        <LobbyScreen conn={conn} lobby={conn.lobby} me={conn.playerId} />
      ) : (
        <Home conn={conn} />
      )}
    </main>
  );
}

function ConnectionBanner({ waking }: { waking: boolean }) {
  return (
    <div className="banner" role="status">
      {waking ? "Waking up the server. The first game after a quiet spell can take up to a minute." : "Connecting…"}
    </div>
  );
}

function Logo() {
  return (
    <h1 className="logo">
      <span>Boom</span> <span>Boom</span> <em>Busta</em>
    </h1>
  );
}

function Home({ conn }: { conn: Connection }) {
  const [name, setName] = useState(loadName);
  const [linked] = useState(codeFromUrl);
  const [code, setCode] = useState(linked ?? "");
  const ready = conn.status === "open";

  const submit = (event: FormEvent, action: "create" | "join") => {
    event.preventDefault();
    saveName(name.trim());
    if (action === "create") conn.send({ type: "create", name });
    else conn.send({ type: "join", code, name });
  };

  return (
    <section className="home">
      <Logo />
      <div className="fan" aria-hidden="true">
        <CardFace id="boss" className="fan-card left" />
        <CardBack className="fan-card mid" />
        <CardFace id="busta" className="fan-card right" />
      </div>
      <p className="pitch">Two teams. Two rooms. One Busta who has to end up next to the Boss.</p>
      <p className="rules-link">
        <a href={RULES_URL} target="_blank" rel="noopener noreferrer">
          How to play
        </a>
      </p>
      {conn.notice && <p className="notice">{conn.notice}</p>}
      <form className="panel" onSubmit={(e) => submit(e, code.length === 4 ? "join" : "create")}>
        {linked && (
          <p className="invited">
            You're invited to lobby <strong>{linked}</strong>
          </p>
        )}
        <label>
          Your name
          <input
            value={name}
            maxLength={MAX_NAME_LENGTH}
            onChange={(e) => setName(e.target.value)}
            autoComplete="nickname"
          />
        </label>
        {linked ? (
          <>
            <button
              type="button"
              className="btn hot"
              disabled={!ready || !name.trim()}
              onClick={(e) => submit(e, "join")}
            >
              Join lobby {linked}
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={!ready || !name.trim()}
              onClick={(e) => submit(e, "create")}
            >
              Create a new lobby instead
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn hot"
              disabled={!ready || !name.trim()}
              onClick={(e) => submit(e, "create")}
            >
              Create a lobby
            </button>
            <div className="or">or join one with its code</div>
            <div className="join-row">
              <input
                className="code-input"
                value={code}
                placeholder="CODE"
                aria-label="Lobby code"
                maxLength={4}
                autoCapitalize="characters"
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
              />
              <button
                type="button"
                className="btn"
                disabled={!ready || !name.trim() || code.length !== 4}
                onClick={(e) => submit(e, "join")}
              >
                Join
              </button>
            </div>
          </>
        )}
      </form>
    </section>
  );
}

function LobbyScreen({ conn, lobby, me }: { conn: Connection; lobby: LobbyView; me: string }) {
  const [copied, setCopied] = useState(false);
  const isHost = lobby.hostId === me;
  const missing = Math.max(0, lobby.minPlayers - lobby.players.length);

  const link = lobbyLink(lobby.code);
  const copyLink = async () => {
    setCopied(await copyText(link));
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="lobby">
      <header className="lobby-head">
        <div className="lobby-id">
          <div className="label">Lobby</div>
          <div className="code">{lobby.code}</div>
          <div className="lobby-link">{link.replace(/^https?:\/\//, "")}</div>
        </div>
        <button type="button" className={copied ? "btn small copied" : "btn small"} onClick={copyLink}>
          {copied ? "Copied!" : "Copy link"}
        </button>
      </header>

      <h2>
        Players <span className="count">{lobby.players.length}</span>
      </h2>
      <ul className="players">
        {lobby.players.map((p) => (
          <li key={p.id} className={p.connected ? "" : "away"}>
            <span className="avatar">{p.name.slice(0, 1).toUpperCase()}</span>
            <span className="pname">
              {p.name}
              {p.id === me && <span className="tag">you</span>}
              {p.id === lobby.hostId && <span className="tag host">host</span>}
              {!p.connected && <span className="tag">reconnecting</span>}
            </span>
            {isHost && p.id !== me && (
              <button
                type="button"
                className="kick"
                aria-label={`Remove ${p.name}`}
                onClick={() => conn.send({ type: "kick", playerId: p.id })}
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
      <SpecialCards conn={conn} lobby={lobby} isHost={isHost} />
      <InfluenceSetting conn={conn} lobby={lobby} isHost={isHost} />

      <p className="hint">
        {missing > 0
          ? `Waiting for ${missing} more player${missing === 1 ? "" : "s"}. Copy the link and send it to your friends.`
          : isHost
            ? "Everyone in? Deal the cards."
            : "Waiting for the host to deal the cards."}
      </p>

      <footer className="lobby-actions">
        {isHost && (
          <button type="button" className="btn hot" disabled={missing > 0} onClick={() => conn.send({ type: "deal" })}>
            Deal cards
          </button>
        )}
        <button type="button" className="btn ghost" onClick={() => conn.send({ type: "leave" })}>
          Leave
        </button>
      </footer>
    </section>
  );
}

function SpecialCards({ conn, lobby, isHost }: { conn: Connection; lobby: LobbyView; isHost: boolean }) {
  const { specials } = lobby.settings;
  const count = Math.max(lobby.players.length, lobby.minPlayers);
  return (
    <>
      <h2>Special cards</h2>
      <ul className="specials">
        {SPECIAL_CARDS.map((id) => {
          const on = specials.includes(id);
          return (
            <li key={id} className={on ? "on" : ""}>
              <CardFace id={id} className="special-card" />
              <span className="special-text">
                <strong>{CARDS[id].name}</strong>
                <span>{SPECIAL_RULES[id]}</span>
              </span>
              {isHost ? (
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={CARDS[id].name}
                  className="switch"
                  onClick={() => conn.send({ type: "setSpecial", card: id, on: !on })}
                />
              ) : (
                <span className="tag">{on ? "on" : "off"}</span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="hint deal-summary">{dealSummary(count, specials)}</p>
    </>
  );
}

function InfluenceSetting({ conn, lobby, isHost }: { conn: Connection; lobby: LobbyView; isHost: boolean }) {
  const on = lobby.settings.influence;
  return (
    <>
      <h2>Extra rules</h2>
      <ul className="specials">
        <li className={on ? "on" : ""}>
          <InfluenceCoin className="special-card influence-icon" />
          <span className="special-text">
            <strong>Influence</strong>
            <span>Everyone gets 2 Influence, +1 a round, to Campaign or Demand a color or card.</span>
          </span>
          {isHost ? (
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label="Influence"
              className="switch"
              onClick={() => conn.send({ type: "setInfluence", on: !on })}
            />
          ) : (
            <span className="tag">{on ? "on" : "off"}</span>
          )}
        </li>
      </ul>
    </>
  );
}

function CardGallery() {
  return (
    <main className="gallery">
      {(Object.keys(CARDS) as CardId[]).flatMap((id) =>
        CARDS[id].team === "either" ? (
          (["blue", "red"] as const).map((team) => (
            <CardFace key={`${id}-${team}`} id={id} team={team} className="gallery-card" />
          ))
        ) : (
          <CardFace key={id} id={id} className="gallery-card" />
        ),
      )}
      <CardBack className="gallery-card" />
    </main>
  );
}
