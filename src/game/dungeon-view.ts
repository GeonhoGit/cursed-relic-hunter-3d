
import { adjacentRooms, currentRoom, DIRECTIONS, knownRooms, revealedRoomKind } from '../core/dungeon';
import { ALTAR_PEDESTAL, TREASURE_PEDESTAL, SHOP_MERCHANT, SHOP_COUNTER, type DungeonRoom, type RunState } from '../core/model';

const SYMBOL = { start: '⌂', combat: '·', elite:'♞', treasure: '◇', boss: '♜', altar: '☽', shop: '◈', unknown: '?' };
const LABEL = { start: '시작방', combat: '전투방', elite:'정예방', treasure: '유물방', boss: '보스방', altar: '저주 제단', shop: '상점', unknown: '미확인 방' };
export function dungeonMapMarkup(s: RunState) {
  const rooms = knownRooms(s), current = currentRoom(s);
  if (!current || !rooms.length) return '';
  const minX = Math.min(...rooms.map(r => r.x)), minY = Math.min(...rooms.map(r => r.y));
  const width = (Math.max(...rooms.map(r => r.x)) - minX + 1) * 42 + 16;
  const height = (Math.max(...rooms.map(r => r.y)) - minY + 1) * 34 + 16;
  const position = (r: DungeonRoom) => ({ x: (r.x - minX) * 42 + 29, y: (r.y - minY) * 34 + 25 });
  const links = rooms.flatMap(r => adjacentRooms(s, r.id).filter(d => d.room.id > r.id && rooms.some(k => k.id === d.room.id))
    .map(d => { const a = position(r), b = position(d.room); return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`; })).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="발견한 방 ${rooms.length}개, 현재 ${LABEL[current.kind]}"><g class="map-links">${links}</g>${rooms.map(r => {
    const p = position(r), active = r.id === current.id, kind = revealedRoomKind(s, r);
    return `<g data-room-id="${r.id}" data-current="${active}" data-visited="${r.visited}" data-locked="${!!r.locked}" class="map-node ${active ? 'current' : r.visited ? 'visited' : 'unknown'} ${kind}"><title>${LABEL[kind]} · ${r.locked?'열쇠 필요 · ':''}${active ? '현재 위치' : r.visited ? '방문 완료' : '미탐험'}</title><rect x="${p.x - 15}" y="${p.y - 11}" width="30" height="22" rx="2"/><text x="${p.x}" y="${p.y + 4}">${r.locked?'⚿':SYMBOL[kind]}</text>${r.cleared && r.kind !== 'start' ? `<circle cx="${p.x + 11}" cy="${p.y - 7}" r="2"/>` : ''}</g>`;
  }).join('')}</svg>`;
}
