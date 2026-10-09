type Position={id:string;action:string|undefined;index:number};
const selector='button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),a[href],summary,[tabindex]:not([tabindex="-1"])';
function elements(panel:HTMLElement){return Array.from(panel.querySelectorAll<HTMLElement>(selector)).filter(e=>!e.closest('[hidden],[inert]')&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden');}
export class ModalFocus{
 private positions=new Map<string,Position>();
 capture(mode:string,panel:HTMLElement){const active=document.activeElement as HTMLElement;if(!mode||!panel.contains(active))return;const list=elements(panel);this.positions.set(mode,{id:active.id,action:active.dataset.action,index:list.indexOf(active)});}
 restore(mode:string,panel:HTMLElement){const list=elements(panel),old=this.positions.get(mode);const target=old&&(old.id?list.find(e=>e.id===old.id):old.action?list.find(e=>e.dataset.action===old.action):undefined)||list[Math.max(0,Math.min(old?.index??0,list.length-1))];if(target)target.focus();else{panel.tabIndex=-1;panel.focus();}}
 tab(event:KeyboardEvent,panel:HTMLElement){if(event.key!=='Tab'||event.ctrlKey||event.altKey||event.metaKey)return;const list=elements(panel);event.preventDefault();if(!list.length){panel.focus();return;}const index=list.indexOf(document.activeElement as HTMLElement);list[index<0?(event.shiftKey?list.length-1:0):(index+(event.shiftKey?-1:1)+list.length)%list.length].focus();}
}
