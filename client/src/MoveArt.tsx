import type { JSX } from "react";
import { MOVES, type MoveId } from "../../shared/moves";

// Move cards share one frame that is clearly not an identity card: a dark felt face, a gold or
// violet border (announced or secret), a "MOVE" tab, a big icon in a spotlight, and the rule
// printed on the card so players never need to look it up.

const INK = "#14111f";
const FELT = "#231b38";
const SECRET = { main: "#a35cff", light: "#d9c4ff", label: "SECRET" };
const OPEN = { main: "#ffb020", light: "#ffe2a3", label: "ANNOUNCED" };

function Forgery() {
  // A fountain pen signing a squiggle.
  return (
    <g stroke={INK} strokeWidth="4.5" strokeLinejoin="round" strokeLinecap="round">
      <path d="M58 170 C78 150 92 182 112 162 S146 150 160 168" fill="none" stroke="#9cc3ff" strokeWidth="6" />
      <g transform="rotate(38 140 112)">
        <rect x="124" y="40" width="32" height="70" rx="8" fill="#ff4b3e" />
        <rect x="124" y="98" width="32" height="12" fill="#ffde59" />
        <path d="M124 110 L156 110 L140 152 Z" fill="#e4def3" />
        <path d="M140 118 L140 140" />
        <circle cx="140" cy="126" r="3.5" fill={INK} />
      </g>
    </g>
  );
}

function Alibi() {
  // A coin that is red on one side and blue on the other, flipping.
  return (
    <g stroke={INK} strokeWidth="4.5" strokeLinejoin="round" strokeLinecap="round">
      <path d="M125 62 A50 50 0 0 0 125 162 Z" fill="#ff4b3e" />
      <path d="M125 62 A50 50 0 0 1 125 162 Z" fill="#2f7bff" />
      <circle cx="125" cy="112" r="50" fill="none" />
      <path d="M62 84 C46 112 54 150 82 170" fill="none" stroke="#ffde59" strokeWidth="7" />
      <path d="M72 172 L86 174 L82 160" fill="none" stroke="#ffde59" strokeWidth="7" />
      <path d="M188 140 C204 112 196 74 168 54" fill="none" stroke="#ffde59" strokeWidth="7" />
      <path d="M178 52 L164 50 L168 64" fill="none" stroke="#ffde59" strokeWidth="7" />
    </g>
  );
}

function Wiretap() {
  // An old phone handset with a coiled cord and sound waves.
  return (
    <g stroke={INK} strokeWidth="4.5" strokeLinejoin="round" strokeLinecap="round">
      <path
        d="M80 70 C68 70 60 84 66 100 C80 140 108 166 146 178 C162 184 176 176 176 164 L176 150 C176 144 170 140 164 140 L146 142 C140 142 136 146 134 152 C116 146 102 132 96 114 C102 112 106 108 106 102 L108 84 C108 78 104 72 98 72 Z"
        fill="#e4def3"
      />
      <path
        d="M176 160 C196 166 186 182 200 186 C214 190 204 206 218 208"
        fill="none"
        stroke="#ffde59"
        strokeWidth="5"
      />
      <path d="M150 74 C164 78 172 88 174 100" fill="none" stroke="#d9c4ff" strokeWidth="6" />
      <path d="M152 50 C176 56 194 74 198 98" fill="none" stroke="#d9c4ff" strokeWidth="6" />
    </g>
  );
}

function Peek() {
  // An eye looking through a keyhole.
  return (
    <g stroke={INK} strokeWidth="4.5" strokeLinejoin="round">
      <circle cx="125" cy="112" r="60" fill="#3a2d5c" />
      <path
        d="M125 66 C143 66 154 80 154 96 C154 108 147 117 138 122 L150 168 L100 168 L112 122 C103 117 96 108 96 96 C96 80 107 66 125 66 Z"
        fill={INK}
      />
      <path d="M102 98 C110 86 140 86 148 98 C140 110 110 110 102 98 Z" fill="#fff" />
      <circle cx="125" cy="98" r="8" fill="#2f7bff" />
      <circle cx="125" cy="98" r="3.5" fill={INK} stroke="none" />
      <circle cx="122" cy="95" r="1.8" fill="#fff" stroke="none" />
    </g>
  );
}

function Demand() {
  // An interrogation lamp shining down on a card.
  return (
    <g stroke={INK} strokeWidth="4.5" strokeLinejoin="round" strokeLinecap="round">
      <path d="M100 98 L58 192 L192 192 L150 98 Z" fill="#ffde59" opacity=".35" stroke="none" />
      <path d="M125 36 L125 58" />
      <path d="M92 98 C92 70 158 70 158 98 Z" fill="#7a6a99" />
      <ellipse cx="125" cy="98" rx="33" ry="7" fill="#fff6c8" />
      <rect x="104" y="140" width="42" height="56" rx="6" fill="#fff" transform="rotate(-8 125 168)" />
      <path d="M116 158 L134 156 M116 170 L134 168 M116 182 L128 181" stroke="#a99fc2" strokeWidth="3.5" />
    </g>
  );
}

const ICONS: Record<MoveId, () => JSX.Element> = {
  forgery: Forgery,
  alibi: Alibi,
  wiretap: Wiretap,
  peek: Peek,
  demand: Demand,
};

export function MoveCard({ id, className }: { id: MoveId; className?: string }) {
  const move = MOVES[id];
  const c = move.secret ? SECRET : OPEN;
  const Icon = ICONS[id];
  const glow = `move-glow-${id}`;
  return (
    <svg className={className} viewBox="0 0 250 350" role="img" aria-label={`${move.name} Move: ${move.text}`}>
      <defs>
        <radialGradient id={glow} cx="50%" cy="34%" r="55%">
          <stop offset="0" stopColor={c.main} stopOpacity=".55" />
          <stop offset="1" stopColor={FELT} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="246" height="346" rx="22" fill={c.main} />
      <rect x="10" y="10" width="230" height="330" rx="15" fill={FELT} />
      <rect x="10" y="10" width="230" height="200" rx="15" fill={`url(#${glow})`} />
      <rect x="18" y="18" width="62" height="22" rx="11" fill={INK} />
      <text x="49" y="34" textAnchor="middle" fontFamily="Bungee, Impact, sans-serif" fontSize="12" fill={c.main}>
        MOVE
      </text>
      <text
        x="230"
        y="34"
        textAnchor="end"
        fontFamily="Rubik, sans-serif"
        fontWeight="800"
        fontSize="11"
        fill={c.light}
      >
        {c.label}
      </text>
      <g transform="translate(0 10)">
        <Icon />
      </g>
      <rect x="10" y="214" width="230" height="40" fill={INK} />
      <text x="125" y="243" textAnchor="middle" fontFamily="Bungee, Impact, sans-serif" fontSize="25" fill="#fff">
        {move.name.toUpperCase()}
      </text>
      <text textAnchor="middle" fontFamily="Rubik, sans-serif" fontSize="15" fill="#f4f0ff">
        {move.lines.map((line, i) => (
          <tspan key={line} x="125" y={276 + i * 18}>
            {line}
          </tspan>
        ))}
      </text>
    </svg>
  );
}
