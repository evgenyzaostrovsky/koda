import {CHAT_HISTORY_MAX_MESSAGES,type ChatHistorySnapshot} from './chatHistory';
import {mergeChatMessages,type ChatSyncSnapshot} from './chatSync';
export function acknowledgeChatMessages(snapshot:ChatHistorySnapshot,ids:Iterable<string>):ChatHistorySnapshot {
  const synced=new Set([...(snapshot.syncedMessageIds??[]),...ids]);
  return {...snapshot,syncedMessageIds:snapshot.messages.filter(message=>synced.has(message.id)).map(message=>message.id)};
}
export function canAppendChatMessages(snapshot:ChatHistorySnapshot,count:number):boolean {
  const synced=new Set(snapshot.syncedMessageIds??[]);
  const evicted=snapshot.messages.slice(0,Math.max(0,snapshot.messages.length+count-CHAT_HISTORY_MAX_MESSAGES));
  return evicted.every(message=>synced.has(message.id));
}
export function stampLegacyChat(snapshot:ChatHistorySnapshot,now=Date.now()):ChatHistorySnapshot {
  return {...snapshot,messages:snapshot.messages.map((message,index)=>message.createdAt?message:{...message,createdAt:new Date(now-snapshot.messages.length+index).toISOString()})};
}
export function mergeCloudChat(local:ChatHistorySnapshot,remote:ChatSyncSnapshot):ChatHistorySnapshot {
  let messages=mergeChatMessages(local.messages,remote.messages);
  const latestReply=[...messages].reverse().find(m=>m.role==='koda');
  const remoteReply=[...remote.messages].reverse().find(m=>m.role==='koda');
  const answered=local.pendingMessageId&&messages.some(m=>m.id==='reply-'+local.pendingMessageId&&m.role==='koda');
  // Keep an unanswered turn identifiable across reload even when a newer remote tail fills the limit.
  const pendingMessage=local.pendingRequest&&local.messages.find(m=>m.id===local.pendingMessageId&&m.role==='user');
  if(pendingMessage&&!answered&&!messages.some(m=>m.id===pendingMessage.id))messages=[pendingMessage,...messages.slice(-(CHAT_HISTORY_MAX_MESSAGES-1))];
  const result:ChatHistorySnapshot={...local,messages,provider:latestReply&&latestReply.id===remoteReply?.id?(remote.provider??local.provider):local.provider,pendingRequest:answered?null:local.pendingRequest};
  if(answered)delete result.pendingMessageId;
  return acknowledgeChatMessages(result,remote.messages.map(message=>message.id));
}
