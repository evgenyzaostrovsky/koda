import AsyncStorage from '@react-native-async-storage/async-storage';
import {supabase} from '../../lib/supabase';
import {isSupabaseConfigured} from '../../config/env';
import {uid} from './utils';
import {createWizardDraftStorage} from './wizardDraft';
import {createSupabaseWizardDraftTransport,emptyWizardSyncState,parseWizardSyncState,normalizeWizardDraft,stageWizardDraft,mergeWizardRevisions,resolveWizardConflict,wizardSyncView,syncWizardDraft,type WizardSyncState,type WizardRevision} from './wizardDraftSync';

export type WizardCloudStatus={status:'local'|'pending'|'syncing'|'synced'|'unavailable'|'conflict';generation:number;heads:WizardRevision[]};
type Slot={state:WizardSyncState;status:WizardCloudStatus;listeners:Set<(value:WizardCloudStatus)=>void>;busy:boolean;timer?:ReturnType<typeof setTimeout>};
const local=createWizardDraftStorage(AsyncStorage);
const slots=new Map<string,Slot>();
const jobs=new Map<string,Promise<unknown>>();
const prefix='koda:goal-wizard:v1:';
const meta=(owner:string)=>`koda:goal-wizard-sync:v1:${owner}`;
const ownerOf=(key:string)=>key.startsWith(prefix)&&key.slice(prefix.length)!=='guest'?key.slice(prefix.length):null;
const enabled=(owner:string|null):owner is string=>Boolean(owner&&isSupabaseConfigured());
const canonical=(raw:string|null)=>{try{return normalizeWizardDraft(raw?JSON.parse(raw):null);}catch{return null;}};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const meaningful=(draft:ReturnType<typeof canonical>)=>Boolean(draft?.wish.trim());
async function serial<T>(owner:string,operation:()=>Promise<T>):Promise<T>{
  const previous=jobs.get(owner);const next=previous?previous.then(operation,operation):operation();jobs.set(owner,next);
  void next.then(()=>{if(jobs.get(owner)===next)jobs.delete(owner);},()=>{if(jobs.get(owner)===next)jobs.delete(owner);});return next;
}
async function slotFor(owner:string){
  let slot=slots.get(owner);if(slot)return slot;
  const state=parseWizardSyncState(await local.getItem(meta(owner)),owner);
  slot={state,status:{status:'local',generation:0,heads:[]},listeners:new Set(),busy:false};slots.set(owner,slot);return slot;
}
function publish(slot:Slot,status:WizardCloudStatus['status'],changed=false){
  slot.status={status,generation:slot.status.generation+(changed?1:0),heads:wizardSyncView(slot.state).heads};
  for(const listener of slot.listeners)listener(slot.status);
}
async function saveState(owner:string,slot:Slot){await local.setItem(meta(owner),JSON.stringify(slot.state));}
async function owns(owner:string){const {data,error}=await supabase.auth.getSession();return !error&&data.session?.user.id===owner;}
function schedule(owner:string,slot:Slot){if(slot.timer)clearTimeout(slot.timer);slot.timer=setTimeout(()=>{slot.timer=undefined;void refreshWizardDraft(owner);},1000);}

// Local writes finish before network work. Pending edits are compared with the
// persisted revision on the next attempt, including after a process restart.
export const cloudWizardDraftStorage={
  async getItem(key:string){return local.getItem(key);},
  async setItem(key:string,value:string){
    const owner=ownerOf(key);
    if(!enabled(owner)){await local.setItem(key,value);return;}
    await serial(owner,async()=>{
      let slot:Slot;
      try{slot=await slotFor(owner);}catch{await local.setItem(key,value);return;}
      const view=wizardSyncView(slot.state);
      if(view.kind==='conflict'){
        // Preserve a last keystroke arriving before the conflict UI has rendered.
        const draft=canonical(value),before=canonical(await local.getItem(key));
        if(draft&&!same(draft,before)){
          const parent=view.heads.find(head=>same(head.draft,before));
          const revision={id:uid('wizard-revision'),parentIds:parent?[parent.id]:[],draft};
          const current=slot.state;
          slot.state=mergeWizardRevisions(current,[revision]);
          slot.state={...slot.state,outbox:[...new Set([...current.outbox,revision.id])]};
          await saveState(owner,slot);await local.setItem(key,value);publish(slot,'conflict');schedule(owner,slot);
        }
        return;
      }
      await local.setItem(key,value);
      if(meaningful(canonical(value))){publish(slot,'pending');schedule(owner,slot);}
    });
  },
  async removeItem(key:string){
    const owner=ownerOf(key);
    if(!enabled(owner)){await local.removeItem(key);return;}
    await serial(owner,async()=>{
      const slot=await slotFor(owner);
      // Clearing consumes all currently known branches; never edit a remote row.
      const view=wizardSyncView(slot.state);
      if(view.kind==='conflict')throw new Error('Сначала выбери версию черновика.');
      slot.state=stageWizardDraft(slot.state,null,uid('wizard-revision'));
      await saveState(owner,slot);await local.removeItem(key);publish(slot,'pending');schedule(owner,slot);
    });
  },
};

export async function watchWizardDraft(owner:string,listener:(value:WizardCloudStatus)=>void){
  if(!enabled(owner)){listener({status:'local',generation:0,heads:[]});return ()=>{};}
  try{const slot=await serial(owner,()=>slotFor(owner));slot.listeners.add(listener);listener(slot.status);
    return ()=>{slot.listeners.delete(listener);};
  }catch{listener({status:'unavailable',generation:0,heads:[]});return ()=>{};}
}

export async function refreshWizardDraft(owner:string):Promise<void>{
  if(!enabled(owner))return;
  let slot:Slot;
  try{if(!await owns(owner))return;slot=await serial(owner,()=>slotFor(owner));}catch{return;}
  if(slot.busy)return;slot.busy=true;
  let snapshot:WizardSyncState|undefined, captured:string|null=null;
  try{
    await serial(owner,async()=>{
      captured=await local.getItem(prefix+owner);
      const draft=canonical(captured),view=wizardSyncView(slot.state);
      if(view.kind!=='conflict'&&meaningful(draft)&&!same(draft,view.draft)){
        slot.state=stageWizardDraft(slot.state,draft,uid('wizard-revision'));await saveState(owner,slot);
      }
      snapshot=slot.state;publish(slot,'syncing');
    });
    const result=await syncWizardDraft(snapshot!,createSupabaseWizardDraftTransport(supabase));
    if(!await owns(owner))return;
    await serial(owner,async()=>{
      const latestRaw=await local.getItem(prefix+owner),latest=canonical(latestRaw);
      // Edits made during the request become a child of the original local
      // branch before remote branches arrive. Neither whole draft is discarded.
      if(latestRaw!==captured&&meaningful(latest)&&wizardSyncView(slot.state).kind!=='conflict'){
        slot.state=stageWizardDraft(slot.state,latest,uid('wizard-revision'));
      }
      const acknowledged=new Set(snapshot!.outbox.filter(id=>!result.outbox.includes(id)));
      slot.state=mergeWizardRevisions(slot.state,result.revisions);
      slot.state={...slot.state,outbox:slot.state.outbox.filter(id=>!acknowledged.has(id))};
      await saveState(owner,slot);
      const view=wizardSyncView(slot.state);
      if(view.kind==='conflict'){publish(slot,'conflict');return;}
      const next=view.draft?JSON.stringify(view.draft):null;
      const localDraft=canonical(latestRaw);
      const changed=!same(meaningful(localDraft)?localDraft:null,view.draft);
      if(next)await local.setItem(prefix+owner,next);else await local.removeItem(prefix+owner);
      publish(slot,slot.state.outbox.length?'pending':'synced',changed);
      if(slot.state.outbox.length)schedule(owner,slot);
    });
  }catch{publish(slot,'unavailable');}
  finally{slot.busy=false;}
}

export async function chooseWizardDraft(owner:string,revisionId:string){
  if(!enabled(owner)||!await owns(owner))throw new Error('Аккаунт изменился. Открой мастер заново.');
  await serial(owner,async()=>{
    const slot=await slotFor(owner);
    slot.state=resolveWizardConflict(slot.state,revisionId,uid('wizard-revision'));
    await saveState(owner,slot);
    const draft=wizardSyncView(slot.state).draft;
    if(draft)await local.setItem(prefix+owner,JSON.stringify(draft));else await local.removeItem(prefix+owner);
    publish(slot,'pending',true);schedule(owner,slot);
  });
}
