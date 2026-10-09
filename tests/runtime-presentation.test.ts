import {describe,expect,it} from 'vitest';
import {canAdvanceLegacy,completionModal} from '../src/game/runtime-presentation';
import {createRun,createDungeonRun} from '../src/core/simulation';

describe('compatible completion presentation',()=>{
 it('keeps a supported bare old snapshot in gameplay and opens a result at completion',()=>{
  const s=createRun(42);delete s.expedition;s.phase='combat';expect(completionModal(s)).toBeNull();s.phase='cleared';expect(completionModal(s)).toBe('result');s.phase='dead';expect(completionModal(s)).toBe('result');
 });
 it('continues the legacy linear reward and chosen-reward screens without treating them as terminal',()=>{
  const s=createRun(42);s.phase='cleared';s.expedition!.reward={room:0,candidates:['R49'],choice:null};expect(completionModal(s)).toBe('reward');s.expedition!.reward.choice='skip';expect(completionModal(s)).toBe('reward');
 });
 it('distinguishes maze exploration and pending reward selection',()=>{
  const s=createDungeonRun(42,3);expect(completionModal(s)).toBeNull();s.expedition!.room=6;s.phase='cleared';s.expedition!.dungeon!.rooms[6].reward={room:6,candidates:['R49'],choice:null};expect(completionModal(s)).toBe('reward');
 });
 it('keeps a next-room action for the old gatekeeper route after its third no-reward chamber',()=>{
  const s=createRun(42);s.expedition!.room=2;s.phase='cleared';s.enemies=[];expect(completionModal(s)).toBe('result');expect(canAdvanceLegacy(s)).toBe(true);
  delete s.expedition;expect(canAdvanceLegacy(s)).toBe(false);const maze=createDungeonRun(42,3);maze.phase='cleared';expect(canAdvanceLegacy(maze)).toBe(false);
 });
});
