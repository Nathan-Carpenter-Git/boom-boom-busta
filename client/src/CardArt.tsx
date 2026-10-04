import type { JSX } from "react";
import { CARDS, type CardId, type Team } from "../../shared/cards";

// Original card art, drawn as SVG so it stays sharp on every screen and costs no download.
// Every card shares one frame: team colour border, halftone sky, a big icon, and a name banner.

const PALETTE: Record<Team, { main: string; dark: string; light: string }> = {
  blue: { main: "#2f7bff", dark: "#0f2a66", light: "#9cc3ff" },
  red: { main: "#ff4b3e", dark: "#5c1010", light: "#ffb2a8" },
  grey: { main: "#a99fc2", dark: "#2e2940", light: "#e4def3" },
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

const ICONS: Record<CardId, () => JSX.Element> = {
  boss: Crown,
  busta: Bomb,
  "blue-crew": Shield,
  "red-crew": Match,
  bookie: Dice,
};

export function CardFace({ id, className }: { id: CardId; className?: string }) {
  const card = CARDS[id];
  const c = PALETTE[card.team];
  const Icon = ICONS[id];
  const pattern = `dots-${id}`;
  const glow = `glow-${id}`;
  const clip = `clip-${id}`;
  const special = id === "boss" || id === "busta";
  return (
    <svg className={className} viewBox="0 0 250 350" role="img" aria-label={`${card.name}, ${card.tagline}`}>
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
      <text x="125" y="290" textAnchor="middle" fontFamily="Bungee, Impact, sans-serif" fontSize="25" fill="#fff">
        {card.name.toUpperCase()}
      </text>
      <text x="125" y="318" textAnchor="middle" fontFamily="Rubik, sans-serif" fontSize="14" fill={c.light}>
        {card.tagline}
      </text>
      <circle cx="36" cy="36" r="14" fill={INK} />
      <circle cx="36" cy="36" r="8" fill={c.main} />
      <circle cx="214" cy="36" r="14" fill={INK} />
      <circle cx="214" cy="36" r="8" fill={c.main} />
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
