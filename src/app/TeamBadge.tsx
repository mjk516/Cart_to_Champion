// F1 팀 엠블럼(SPEC §11 v0.19). 실제 팀 로고는 상표라 쓰지 않고,
// 팀 색과 약자로 만든 자체 엠블럼을 그린다. 모양은 팀 id로 고정한다.

import { hashSeed } from '../engine';
import { useGame } from './store';

interface BadgeTeam { id: string; name: string; color: string }

/** 화면에 쓰는 팀 약자. 목록에 없는 팀(신규 참가)은 이름 머리글자 */
const ABBR: Record<string, string> = {
  mclaren: 'MCL', mercedes: 'MER', red_bull: 'RBR', ferrari: 'FER', williams: 'WIL', aston_martin: 'AMR',
  racing_bulls: 'RB', haas: 'HAA', alpine: 'ALP', audi: 'AUD', cadillac: 'CAD',
};

function teamAbbr(t: BadgeTeam): string {
  if (ABBR[t.id]) return ABBR[t.id]!;
  const words = t.name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.map((w) => w[0]).join('') : (words[0] ?? t.id).slice(0, 3)).slice(0, 3).toUpperCase();
}

/** 밝은 팀 색 위에는 검은 글자, 어두운 색 위에는 흰 글자 */
function ink(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#0a0a0a' : '#ffffff';
}

const SHAPES = [
  'M4 3h32v19c0 8-8 13-16 15C12 35 4 30 4 22z', // 방패
  'M20 2a18 18 0 1 0 0.01 0z', // 원
  'M11 3h18l9 17-9 17H11L2 20z', // 육각
  'M6 3h28a3 3 0 0 1 3 3v28a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z', // 둥근 사각
];

export function TeamBadge({ team, size = 28 }: { team: BadgeTeam; size?: number }) {
  const shape = SHAPES[hashSeed('emblem', team.id) % SHAPES.length]!;
  const abbr = teamAbbr(team);
  const fg = ink(team.color);
  const clip = `emblem-${team.id}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={`${team.name} 엠블럼`} className="shrink-0">
      <defs><clipPath id={clip}><path d={shape} /></clipPath></defs>
      <path d={shape} fill={team.color} />
      {/* 사선 줄무늬 하나로 팀마다 다른 인상을 준다 */}
      <g clipPath={`url(#${clip})`}><path d="M-4 30 L30 -4 L38 -4 L4 38 Z" fill={fg} opacity={0.14} /></g>
      <path d={shape} fill="none" stroke="#000" strokeOpacity={0.35} strokeWidth={1.5} />
      <text x={20} y={abbr.length > 2 ? 24.5 : 25.5} textAnchor="middle" fontSize={abbr.length > 2 ? 11 : 14} fontWeight={900} fill={fg} fontFamily="system-ui, sans-serif" letterSpacing={-0.3}>{abbr}</text>
    </svg>
  );
}

/** 지금 F1 그리드의 팀이면 엠블럼을, 아니면(하부 리그 팀 등) 아무것도 그리지 않는다 */
export function F1TeamBadge({ teamId, size }: { teamId?: string | null; size?: number }) {
  const team = useGame((s) => s.career?.world.teams.teams.find((t) => t.id === teamId));
  return team ? <TeamBadge team={team} size={size} /> : null;
}
