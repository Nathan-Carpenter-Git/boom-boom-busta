import { useEffect, useMemo, useState } from "react";
import { CARDS, type CardId, TEAM_LABEL } from "../../shared/cards";
import type { GameAction, GameView, KnownInfo, LobbyView, ShareKind, ShareRequest } from "../../shared/protocol";
import { ROOM_NAMES, type RoomIndex } from "../../shared/rules";
import { CardBack, CardFace } from "./CardArt";
import type { Connection } from "./connection";

const ROOM_CLASS = ["basement", "rooftop"] as const;
const otherRoom = (room: RoomIndex): RoomIndex => (room === 0 ? 1 : 0);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Seconds left in the current phase, counted down on this device from the server's end time. */
function useSecondsLeft(game: GameView): number | null {
  // Phones' clocks drift; measure the offset to the server clock whenever a new view arrives.
  const offset = useMemo(() => game.serverNow - Date.now(), [game.serverNow]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  return game.endsAt === null ? null : Math.max(0, Math.ceil((game.endsAt - now - offset) / 1000));
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

interface Props {
  conn: Connection;
  lobby: LobbyView;
  game: GameView;
  me: string;
  card: CardId;
  room: RoomIndex;
}

export function GameScreen({ conn, lobby, game, me, card, room }: Props) {
  const isHost = lobby.hostId === me;
  const act = (action: GameAction) => conn.send({ type: "act", action });
  const nameOf = (id: string) => game.players.find((p) => p.id === id)?.name ?? "?";
  const props = { game, me, card, room, act, nameOf };

  return (
    <section className={`game ${ROOM_CLASS[room]}`}>
      {game.phase === "results" ? (
        <Results {...props} />
      ) : (
        <>
          <GameHeader game={game} room={room} />
          {game.phase === "moving" ? <Moving {...props} /> : <Room {...props} connected={lobby.players} />}
        </>
      )}
      <footer className="lobby-actions">
        {isHost && game.phase === "results" && (
          <button type="button" className="btn hot" onClick={() => conn.send({ type: "backToLobby" })}>
            Back to the lobby
          </button>
        )}
        {isHost && game.phase !== "results" && (
          <button
            type="button"
            className="btn ghost"
            onClick={() => confirm("End the game for everyone?") && conn.send({ type: "backToLobby" })}
          >
            End the game
          </button>
        )}
        <button
          type="button"
          className="btn ghost"
          onClick={() =>
            (game.phase === "results" || confirm("Leave the game? Your card stays in play.")) &&
            conn.send({ type: "leave" })
          }
        >
          Leave
        </button>
      </footer>
    </section>
  );
}

function GameHeader({ game, room }: { game: GameView; room: RoomIndex }) {
  const seconds = useSecondsLeft(game);
  const plan = game.rounds[game.round];
  const sub =
    game.phase === "vote"
      ? "Elect a leader"
      : game.phase === "moving"
        ? "Hostages moving"
        : `Round ${game.round + 1} of ${game.rounds.length} · send ${plural(plan.hostages, "hostage")}`;
  return (
    <header className="game-head">
      <div className="head-room">
        <div className="label">You're in</div>
        <div className="room-name">{ROOM_NAMES[room]}</div>
        <div className="label">{sub}</div>
      </div>
      {seconds !== null && (
        <div className={`timer${seconds <= 10 && game.phase === "round" ? " urgent" : ""}`} role="timer">
          {clock(seconds)}
        </div>
      )}
    </header>
  );
}

interface ScreenProps {
  game: GameView;
  me: string;
  card: CardId;
  room: RoomIndex;
  act: (action: GameAction) => void;
  nameOf: (id: string) => string;
}

function MyCard({ card, onReveal }: { card: CardId; onReveal?: () => void }) {
  const [shown, setShown] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const def = CARDS[card];
  return (
    <div className="my-card">
      <button
        type="button"
        className="card-button"
        aria-label={shown ? "Hide your card" : "Peek at your card"}
        onClick={() => setShown((s) => !s)}
      >
        {shown ? <CardFace id={card} className="mini-card" /> : <CardBack className="mini-card" />}
      </button>
      <div className="my-card-text">
        {shown ? (
          <p className={`goal ${def.team}`}>
            <strong>
              {def.name}, {TEAM_LABEL[def.team]}.
            </strong>{" "}
            {def.goal}
          </p>
        ) : (
          <p className="hint left">Tap your card to peek. Keep it hidden.</p>
        )}
        {onReveal && (
          <button
            type="button"
            className="btn small ghost"
            onClick={() => {
              if (confirming) onReveal();
              setConfirming((c) => !c);
            }}
          >
            {confirming ? "Tap again to show everyone" : "Show my card to the room"}
          </button>
        )}
      </div>
    </div>
  );
}

const SHARE_LABEL: Record<ShareKind, string> = { color: "color share", card: "card share" };

function Requests({ game, me, act, nameOf }: ScreenProps) {
  const incoming = game.requests.filter((r) => r.to === me);
  if (incoming.length === 0) return null;
  return (
    <ul className="requests">
      {incoming.map((r) => (
        <li key={r.id}>
          <span>
            <strong>{nameOf(r.from)}</strong> wants a {SHARE_LABEL[r.kind]}
          </span>
          <span className="request-actions">
            <button
              type="button"
              className="btn small"
              onClick={() => act({ type: "answerShare", requestId: r.id, accept: true })}
            >
              Share
            </button>
            <button
              type="button"
              className="btn small ghost"
              onClick={() => act({ type: "answerShare", requestId: r.id, accept: false })}
            >
              No
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Room({ connected, ...props }: ScreenProps & { connected: LobbyView["players"] }) {
  const { game, me, card, room, act, nameOf } = props;
  const [open, setOpen] = useState<string | null>(null);
  const { leader, players } = game.rooms[room];
  const amLeader = leader === me;
  const picking = game.phase === "round";
  const need = game.rounds[game.round].hostages;
  const online = (id: string) => connected.find((p) => p.id === id)?.connected ?? false;
  const goneIds = new Set(game.players.filter((p) => p.gone).map((p) => p.id));
  const votesFor = (id: string) => Object.values(game.votes).filter((v) => v === id).length;
  const majority = Math.floor(players.filter((id) => !goneIds.has(id)).length / 2) + 1;
  const myVote = game.votes[me] ?? null;
  const sent = (to: string, kind: ShareKind): ShareRequest | undefined =>
    game.requests.find((r) => r.from === me && r.to === to && r.kind === kind);
  const isBookie = card === "bookie";
  const lastRound = game.round === game.rounds.length - 1;

  return (
    <div className="room">
      <MyCard card={card} onReveal={() => act({ type: "reveal" })} />
      <Requests {...props} />

      {isBookie && game.phase === "round" && lastRound && (
        <div className="panel bookie">
          <strong>Bookie, call the winner before the last exchange.</strong>
          <div className="pair">
            {(["red", "blue"] as const).map((team) => (
              <button
                key={team}
                type="button"
                className={`btn ${team === "red" ? "hot" : ""} ${game.bookieCall === team ? "chosen" : ""}`}
                onClick={() => act({ type: "bookieCall", team })}
              >
                {team === "red" ? "Red wins" : "Blue wins"}
              </button>
            ))}
          </div>
          <span className="hint left">
            {game.bookieCall
              ? `You called ${game.bookieCall === "red" ? "Red" : "Blue"}. You can change it until 0:00.`
              : "No call means you lose."}
          </span>
        </div>
      )}

      <div className="leader-line">
        {leader ? (
          <>
            Leader: <strong>{nameOf(leader)}</strong>
            {amLeader && <span className="tag host">you</span>}
          </>
        ) : (
          <>No leader yet. Tap a player to vote; {plural(majority, "vote")} wins.</>
        )}
      </div>

      {picking && (
        <div className={`hostage-panel${amLeader ? " mine" : ""}`}>
          <div>
            {amLeader ? "You send" : "The leader sends"} {plural(need, "hostage")} to {ROOM_NAMES[otherRoom(room)]}.
          </div>
          <div>
            Picked: <strong>{game.hostages.length > 0 ? game.hostages.map(nameOf).join(", ") : "nobody yet"}</strong>
          </div>
          {game.hostages.length < need && (
            <div className="hint left">
              {amLeader ? "Tap Send next to a player. " : ""}At 0:00 the app picks any missing hostages at random.
            </div>
          )}
        </div>
      )}

      <ul className="players room-players">
        {players.map((id) => {
          const gone = goneIds.has(id);
          const votes = votesFor(id);
          const hostage = game.hostages.includes(id);
          const expanded = open === id && !gone;
          return (
            <li key={id} className={`${gone || !online(id) ? "away" : ""}${expanded ? " open" : ""}`}>
              <button type="button" className="row-main" onClick={() => setOpen(expanded ? null : id)} disabled={gone}>
                <span className="avatar">{nameOf(id).slice(0, 1).toUpperCase()}</span>
                <span className="pname">
                  <span className="pname-text">{nameOf(id)}</span>
                  {id === me && <span className="tag">you</span>}
                  {id === leader && <span className="tag host">leader</span>}
                  {hostage && <span className="tag hot">hostage</span>}
                  {gone && <span className="tag">left</span>}
                  {myVote === id && <span className="tag mine">your vote</span>}
                </span>
                {votes > 0 && <span className="votes">{plural(votes, "vote")}</span>}
              </button>
              {amLeader && picking && id !== me && (
                <button
                  type="button"
                  className={`btn small send${hostage ? " hot" : ""}`}
                  onClick={() => act({ type: "pickHostage", playerId: id })}
                >
                  {hostage ? "Sending" : "Send"}
                </button>
              )}
              {expanded && (
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => act({ type: "vote", for: myVote === id ? null : id })}
                  >
                    {myVote === id ? "Take back vote" : id === me ? "Vote for me" : "Vote as leader"}
                  </button>
                  {id !== me &&
                    (["color", "card"] as const).map((kind) => {
                      const req = sent(id, kind);
                      return (
                        <button
                          key={kind}
                          type="button"
                          className="btn small ghost"
                          onClick={() =>
                            act(
                              req ? { type: "cancelShare", requestId: req.id } : { type: "requestShare", to: id, kind },
                            )
                          }
                        >
                          {req ? `Cancel ${kind} ask` : `Ask ${SHARE_LABEL[kind]}`}
                        </button>
                      );
                    })}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <Known known={game.known} nameOf={nameOf} />

      <OtherRoom game={game} room={otherRoom(room)} nameOf={nameOf} />
    </div>
  );
}

function Known({ known, nameOf }: { known: KnownInfo[]; nameOf: (id: string) => string }) {
  return (
    <>
      <h2>What I know</h2>
      {known.length === 0 ? (
        <p className="hint left">Nothing yet. Ask someone in your room for a color or card share.</p>
      ) : (
        <ul className="known">
          {known.map((k) => (
            <li key={k.id}>
              <span className={`dot ${k.team}`} />
              <span className="pname">
                <strong>{nameOf(k.id)}</strong>: {k.card ? CARDS[k.card].name : TEAM_LABEL[k.team]}
              </span>
              <span className="via">{k.via}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function OtherRoom({ game, room, nameOf }: { game: GameView; room: RoomIndex; nameOf: (id: string) => string }) {
  const { leader, players } = game.rooms[room];
  return (
    <>
      <h2>{ROOM_NAMES[room]}</h2>
      <ul className="room-list">
        {players.map((id) => (
          <li key={id} className={id === leader ? "lead" : ""}>
            {nameOf(id)}
            {id === leader && " (leader)"}
          </li>
        ))}
      </ul>
    </>
  );
}

function Moving({ game, me, room, nameOf }: ScreenProps) {
  const moved = game.moved ?? [[], []];
  const arrived = moved[room];
  const left = moved[otherRoom(room)];
  const iMoved = arrived.includes(me);
  return (
    <div className="moving">
      <p className="moving-call">
        {iMoved ? `You were sent! Go to ${ROOM_NAMES[room]}.` : "Hostages are swapping rooms."}
      </p>
      <div className="moving-grid">
        <div className="panel">
          <div className="label">Left {iMoved ? ROOM_NAMES[otherRoom(room)] : "your room"}</div>
          <strong>{(iMoved ? arrived : left).map(nameOf).join(", ") || "Nobody"}</strong>
        </div>
        <div className="panel">
          <div className="label">Arrived in {iMoved ? ROOM_NAMES[otherRoom(room)] : "your room"}</div>
          <strong>{(iMoved ? left : arrived).map(nameOf).join(", ") || "Nobody"}</strong>
        </div>
      </div>
      <p className="hint">
        {game.round === game.rounds.length - 1
          ? "That was the last exchange. The cards are about to be revealed."
          : `Round ${game.round + 2} starts when the timer ends.`}
      </p>
    </div>
  );
}

function Results({ game, me, nameOf }: ScreenProps) {
  const results = game.results;
  if (!results) return null;
  const cardOf = (id: string) => results.cards.find((c) => c.id === id)?.card;
  const bossId = results.cards.find((c) => c.card === "boss")?.id ?? "";
  const bossRoom = game.players.find((p) => p.id === bossId)?.room ?? 0;
  const myTeam = CARDS[cardOf(me) ?? "bookie"].team;
  const bookie = results.bookie;
  const iWon = myTeam === results.winner || (bookie?.id === me && bookie.won);
  return (
    <div className="results">
      <div className={`winner ${results.winner}`}>
        <div className="winner-title">{results.winner === "red" ? "Red wins!" : "Blue wins!"}</div>
        <div>
          {results.winner === "red"
            ? `The Busta caught the Boss in ${ROOM_NAMES[bossRoom]}.`
            : "The Boss and the Busta ended in different rooms."}
        </div>
        <div className="you-won">{iWon ? "You won." : "You lost."}</div>
      </div>
      {bookie && (
        <p className="goal grey">
          <strong>{nameOf(bookie.id)}</strong> was the Bookie and{" "}
          {bookie.call ? `called ${bookie.call === "red" ? "Red" : "Blue"}` : "never made a call"}:{" "}
          {bookie.won ? "they win too." : "they lose."}
        </p>
      )}
      {([0, 1] as RoomIndex[]).map((room) => (
        <div key={room}>
          <h2>{ROOM_NAMES[room]}</h2>
          <ul className="reveal-grid">
            {game.rooms[room].players.map((id) => {
              const card = cardOf(id);
              return (
                <li key={id} className={id === me ? "me" : ""}>
                  {card && <CardFace id={card} className="reveal-card" />}
                  <span>{nameOf(id)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
