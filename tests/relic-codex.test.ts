import { describe, expect, it } from 'vitest';
import { defaultProfile, growthRelicUnlocks, emptyInvestment, beginGrowthRun, validProfile } from '../src/core/growth';
import { RELIC_IDS } from '../src/core/relics';
import { createDungeonRun } from '../src/core/simulation';
import * as codex from '../src/core/relic-codex';
import { codexMarkup, codexResultsMarkup } from '../src/game/relic-codex-ui';

describe('permanent relic codex',()=>{
 it('lists all 57 relics in ID order with undiscovered effect previews',()=>{
  const entries=codex.relicCodex(defaultProfile());expect(entries).toHaveLength(57);
  expect(entries.map(e=>e.id)).toEqual([...RELIC_IDS].sort());expect(entries.every(e=>!e.discovered&&!!e.description)).toBe(true);
 });
 it('distinguishes initial availability, first-clear gates and conditional appearances',()=>{
  const entries=codex.relicCodex(defaultProfile()),get=(id:string)=>entries.find(e=>e.id===id)!;
  expect(get('R01').unlocked).toBe(true);expect(get('R11').unlocked).toBe(false);expect(get('R11').unlock.description).toContain('첫 클리어');
  expect(get('R28').unlock.description).toContain('12종');expect(get('R35').unlock.description).toContain('5회');expect(get('R47').unlock.description).toContain('저주');
  expect(get('R38').unlocked).toBe(true);expect(get('R38').appearance).toContain('일반 유물 2개');expect(get('R42').appearance).toContain('다른 보조 기술');
  expect(get('R37').curse).toBe(true);expect(get('R44').curse).toBe(false);
 });
 it('uses actual account goals while retaining a fixed departure snapshot',()=>{
  const p=defaultProfile(),s=createDungeonRun(42,2);beginGrowthRun(s,emptyInvestment(),'codex-old');
  p.rooms=Array.from({length:5},(_,i)=>({runId:`r${i}`,room:1}));p.bossDefeated=true;p.priestDefeated=true;p.heartDefeated=true;p.curseFreeWin=true;
  p.relics=[...new Set(['R13','R16','R17',...RELIC_IDS])].slice(0,24) as typeof p.relics;p.auxiliaryUsed=['R13','R16','R17'];p.purchases=Array.from({length:5},(_,i)=>({runId:`p${i}`,room:10,slot:0}));expect(validProfile(p)).toBe(true);
  const entries=codex.relicCodex(p,s);for(const id of growthRelicUnlocks(p)){const entry=entries.find(e=>e.id===id)!;expect(entry.unlocked).toBe(true);expect(entry.departureUnlocked).toBe(false);}
  expect(entries.find(e=>e.id==='R11')!.departureUnlocked).toBe(false);
 });
 it('keeps consumed and lost items discovered and includes current unsaved acquisitions',()=>{
  const p=defaultProfile(),s=createDungeonRun(42,2);p.relics=['R01'];s.expedition!.acquired=['R20','R37','R39'];s.expedition!.relics=['R39'];s.revival={tick:0,lost:['R37']};
  const entries=codex.relicCodex(p,s),get=(id:string)=>entries.find(e=>e.id===id)!;
  expect(get('R01').discovered).toBe(true);expect(get('R20').runStatus).toBe('consumed');expect(get('R37').runStatus).toBe('lost');expect(get('R39').runStatus).toBe('held');
  const before=structuredClone({p,s});codex.relicCodex(p,s,{query:'성배',status:'discovered',rarity:'legendary'});expect({p,s}).toEqual(before);
 });
 it('combines ID/name/effect search with discovery and grade filters',()=>{
  const p=defaultProfile();p.relics=['R39','R01'];
  expect(codex.relicCodex(p,null,{query:' r39 ',status:'discovered',rarity:'legendary'}).map(e=>e.id)).toEqual(['R39']);
  expect(codex.relicCodex(p,null,{query:'회복품',status:'discovered'}).map(e=>e.id)).toEqual(['R39']);
  expect(codex.relicCodex(p,null,{query:'뒤집힌',status:'undiscovered'})).toEqual([]);
  expect(codex.relicCodex(p,null,{status:'locked'}).every(e=>!e.unlocked)).toBe(true);
 });
 it('renders accessible controls, counters, previews and escaped user search',()=>{
  const p=defaultProfile();p.relics=['R01'];const html=codexMarkup(p,null,{query:'"<test>'});
  expect(html).toContain('발견 1 / 57');expect(html).toContain('label for="codex-search"');expect(html).toContain('aria-live="polite"');
  expect(html).toContain('&quot;&lt;test&gt;');expect(html).not.toContain('value=""<test>');
  const results=codexResultsMarkup(p,null,{query:'R47'});expect(results).toContain('data-relic-id="R47"');expect(results).toContain('봉인된 왕관');expect(results).toContain('미발견');expect(results).toContain('미해금');
  expect(codexResultsMarkup(p,null,{query:'없는유물123'})).toContain('검색 결과가 없습니다');
 });
});
