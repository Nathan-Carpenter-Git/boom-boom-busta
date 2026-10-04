import type { JSX } from "react";
import { CARDS, type CardId, fixedTeam, TEAM_LABEL, type Team } from "../../shared/cards";

// Original card art, drawn as SVG so it stays sharp on every screen and costs no download.
// Every card shares one frame: team colour border, halftone sky, a big icon, and a name banner.

/** "either" colours an either-team card before the deal (lobby, rules), halfway between Red and Blue. */
type Colour = Team | "either";

const PALETTE: Record<Colour, { main: string; dark: string; light: string }> = {
  blue: { main: "#2f7bff", dark: "#0f2a66", light: "#9cc3ff" },
  red: { main: "#ff4b3e", dark: "#5c1010", light: "#ffb2a8" },
  grey: { main: "#a99fc2", dark: "#2e2940", light: "#e4def3" },
  either: { main: "#a35cff", dark: "#2d1366", light: "#d9c4ff" },
};

const INK = "#14111f";
const RAY_ANGLES = Array.from({ length: 12 }, (_, i) => i * 30);

function Bomb() {
  return (
    <g transform="translate(0 14)">
      <path d="M150 92 C162 70 182 64 196 74" stroke="#f2c14e" strokeWidth="6" fill="none" strokeLinecap="round" />
      <g transform="translate(199 70)">
        <polygon
          points="0,-18 5,-6 18,-6 8,2 12,15 0,7 -12,15 -8,2 -18,-6 -5,-6"
          fill="#ffde59"
          stroke={INK}
          strokeWidth="3"
        />
        <circle r="5" fill="#ff5a36" />
      </g>
      <rect x="128" y="86" width="34" height="22" rx="4" transform="rotate(30 145 97)" fill={INK} />
      <circle cx="120" cy="160" r="62" fill={INK} />
      <circle cx="98" cy="136" r="16" fill="#fff" opacity=".28" />
      <circle cx="90" cy="130" r="6" fill="#fff" opacity=".5" />
    </g>
  );
}

function Crown() {
  return (
    <g stroke={INK} strokeWidth="5" strokeLinejoin="round">
      <path d="M58 190 L46 100 L88 138 L125 84 L162 138 L204 100 L192 190 Z" fill="#ffd23f" />
      <rect x="54" y="186" width="142" height="26" rx="6" fill="#ffd23f" />
      <circle cx="46" cy="98" r="9" fill="#fff" />
      <circle cx="125" cy="80" r="10" fill="#fff" />
      <circle cx="204" cy="98" r="9" fill="#fff" />
      <circle cx="125" cy="160" r="12" fill="#2f7bff" />
      <circle cx="84" cy="168" r="7" fill="#ff4b3e" />
      <circle cx="166" cy="168" r="7" fill="#ff4b3e" />
    </g>
  );
}

function Shield() {
  return (
    <g stroke={INK} strokeWidth="5" strokeLinejoin="round">
      <path d="M125 74 L190 96 C190 160 168 196 125 222 C82 196 60 160 60 96 Z" fill="#9cc3ff" />
      <path d="M125 92 L174 109 C173 158 156 186 125 205 Z" fill="#2f7bff" stroke="none" />
      <path d="M100 148 L118 166 L154 126" fill="none" stroke="#fff" strokeWidth="12" strokeLinecap="round" />
    </g>
  );
}

function Match() {
  return (
    <g stroke={INK} strokeWidth="5" strokeLinejoin="round">
      <rect x="114" y="128" width="22" height="100" rx="5" fill="#f2c14e" transform="rotate(14 125 178)" />
      <path d="M118 128 C92 112 96 80 114 62 C114 82 130 82 128 66 C150 82 156 112 132 128 Z" fill="#ff4b3e" />
      <path d="M122 124 C112 116 112 102 120 92 C122 104 132 104 130 96 C138 106 136 118 128 124 Z" fill="#ffde59" />
      <ellipse cx="124" cy="132" rx="16" ry="11" fill="#7a1d12" />
    </g>
  );
}

function Dice() {
  const pips = (cx: number, cy: number, spots: [number, number][]) =>
    spots.map(([x, y]) => <circle key={`${cx}${x}${y}`} cx={cx + x} cy={cy + y} r="7" fill={INK} stroke="none" />);
  return (
    <g stroke={INK} strokeWidth="5" strokeLinejoin="round">
      <rect x="44" y="100" width="88" height="88" rx="14" fill="#fff" transform="rotate(-14 88 144)" />
      <g transform="rotate(-14 88 144)">
        {pips(88, 144, [
          [-22, -22],
          [0, 0],
          [22, 22],
        ])}
      </g>
      <rect x="118" y="120" width="88" height="88" rx="14" fill="#e4def3" transform="rotate(12 162 164)" />
      <g transform="rotate(12 162 164)">
        {pips(162, 164, [
          [-22, -22],
          [22, -22],
          [-22, 22],
          [22, 22],
        ])}
      </g>
    </g>
  );
}

/** A speech bubble with its tail at the bottom left, shared by the Truth Teller and the Liar. */
function Bubble({ fill }: { fill: string }) {
  return (
    <path
      d="M64 66 H186 C204 66 216 78 216 96 V166 C216 184 204 196 186 196 H104 L60 230 L72 196 H64 C46 196 34 184 34 166 V96 C34 78 46 66 64 66 Z"
      fill={fill}
      stroke={INK}
      strokeWidth="6"
      strokeLinejoin="round"
    />
  );
}

function Check() {
  const tick = "M76 132 L110 164 L174 96";
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <Bubble fill="#fff" />
      <path d={tick} stroke={INK} strokeWidth="34" />
      <path d={tick} stroke="#3ddc84" strokeWidth="20" />
    </g>
  );
}

function CrossedFingers() {
  return (
    <g stroke={INK} strokeWidth="5" strokeLinejoin="round">
      <Bubble fill="#fff3c4" />
      {/* The middle finger rises from the right and leans left; the index finger crosses over it. */}
      <rect x="130" y="76" width="26" height="90" rx="13" fill="#f2ad80" transform="rotate(-27 143 160)" />
      <rect x="98" y="76" width="26" height="90" rx="13" fill="#ffd2ad" transform="rotate(27 111 160)" />
      <path
        d="M94 162 C94 151 101 146 111 146 H146 C158 146 164 154 164 165 V176 C164 186 158 192 146 192 H109 C100 192 94 186 94 177 Z"
        fill="#ffd2ad"
      />
      <path d="M104 169 H154" fill="none" strokeWidth="4" strokeLinecap="round" />
      <path d="M94 166 C82 162 78 174 88 180 L98 184" fill="#ffd2ad" />
    </g>
  );
}

const ICONS: Record<CardId, () => JSX.Element> = {
  boss: Crown,
  busta: Bomb,
  "blue-crew": Shield,
  "red-crew": Match,
  bookie: Dice,
  "truth-teller": Check,
  liar: CrossedFingers,
};

/** A card face; `team` colours either-team cards once dealt, and they show in purple without one. */
export function CardFace({ id, team, className }: { id: CardId; team?: Team; className?: string }) {
  const card = CARDS[id];
  const colour: Colour = fixedTeam(id) ?? team ?? "either";
  const c = PALETTE[colour];
  // Corner pips show both teams on a card that could be either.
  const pips = colour === "either" ? [PALETTE.blue.main, PALETTE.red.main] : [c.main, c.main];
  const Icon = ICONS[id];
  const pattern = `dots-${id}-${colour}`;
  const glow = `glow-${id}-${colour}`;
  const clip = `clip-${id}-${colour}`;
  const special = id === "boss" || id === "busta";
  const name = card.name.toUpperCase();
  const label = card.team === "either" && team ? `${card.name}, ${TEAM_LABEL[team]}` : card.name;
  // Long names shrink to stay inside the banner.
  const nameSize = name.length > 11 ? 20 : 25;
  return (
    <svg className={className} viewBox="0 0 250 350" role="img" aria-label={`${label}, ${card.tagline}`}>
      <defs>
        <pattern id={pattern} width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <circle cx="6" cy="6" r="2.2" fill={c.main} opacity=".55" />
        </pattern>
        <radialGradient id={glow} cx="50%" cy="42%" r="60%">
          <stop offset="0" stopColor={c.light} />
          <stop offset=".55" stopColor={c.main} />
          <stop offset="1" stopColor={c.dark} />
        </radialGradient>
        <clipPath id={clip}>
          <rect x="12" y="12" width="226" height="234" rx="14" />
        </clipPath>
      </defs>
      <rect x="2" y="2" width="246" height="346" rx="22" fill={INK} />
      <rect x="12" y="12" width="226" height="326" rx="14" fill={`url(#${glow})`} />
      <rect x="12" y="12" width="226" height="326" rx="14" fill={`url(#${pattern})`} />
      {special && (
        <g fill="#fff" opacity=".18" clipPath={`url(#${clip})`}>
          {RAY_ANGLES.map((angle) => (
            <polygon key={angle} points="125,150 117,-60 133,-60" transform={`rotate(${angle} 125 150)`} />
          ))}
        </g>
      )}
      <Icon />
      <rect x="12" y="250" width="226" height="88" rx="0" fill={INK} />
      <rect x="12" y="324" width="226" height="14" rx="0" fill={INK} />
      <rect x="12" y="246" width="226" height="8" fill={c.main} />
      <text
        x="125"
        y="290"
        textAnchor="middle"
        fontFamily="Bungee, Impact, sans-serif"
        fontSize={nameSize}
        fill="#fff"
        {...(name.length > 11 ? { textLength: 206, lengthAdjust: "spacingAndGlyphs" } : {})}
      >
        {name}
      </text>
      <text x="125" y="318" textAnchor="middle" fontFamily="Rubik, sans-serif" fontSize="14" fill={c.light}>
        {card.tagline}
      </text>
      <circle cx="36" cy="36" r="14" fill={INK} />
      <circle cx="36" cy="36" r="8" fill={pips[0]} />
      <circle cx="214" cy="36" r="14" fill={INK} />
      <circle cx="214" cy="36" r="8" fill={pips[1]} />
    </svg>
  );
}

export function CardBack({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 250 350" role="img" aria-label="Face down card">
      <defs>
        <pattern id="back-stripes" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <rect width="14" height="28" fill="#ff4b3e" />
          <rect x="14" width="14" height="28" fill="#2f7bff" />
        </pattern>
      </defs>
      <rect x="2" y="2" width="246" height="346" rx="22" fill={INK} />
      <rect x="12" y="12" width="226" height="326" rx="14" fill="url(#back-stripes)" opacity=".9" />
      <circle cx="125" cy="175" r="78" fill={INK} />
      <text x="125" y="160" textAnchor="middle" fontFamily="Bungee, Impact, sans-serif" fontSize="30" fill="#ffde59">
        BOOM
      </text>
      <text x="125" y="192" textAnchor="middle" fontFamily="Bungee, Impact, sans-serif" fontSize="30" fill="#ffde59">
        BOOM
      </text>
      <text x="125" y="222" textAnchor="middle" fontFamily="Bungee, Impact, sans-serif" fontSize="22" fill="#fff">
        BUSTA
      </text>
    </svg>
  );
}

/** The Influence token: a gold coin with a megaphone, used in the lobby switch and next to every count. */
export function InfluenceCoin({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <circle cx="20" cy="20" r="17" fill="#ffde59" stroke={INK} strokeWidth="3" />
      <circle cx="20" cy="20" r="12" fill="none" stroke="#c99a17" strokeWidth="2" />
      <path
        d="M12 17 L19 17 L27 12 L27 28 L19 23 L12 23 Z"
        fill={INK}
        stroke={INK}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
