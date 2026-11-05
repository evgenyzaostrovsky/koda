import {useEffect,useRef,useState} from 'react';
import {Modal,Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import {listAssistantMemories,addAssistantMemory,updateAssistantMemory,deleteAssistantMemory} from '../../../services/assistantMemory';
import type {AssistantMemory as Memory} from '../../../ai/assistantMemory';
import {accent,activeText,line,muted,panel,panelSoft,text} from '../theme';

export function AssistantMemory({userId,suggestion,onDismissSuggestion}:{userId?:string|null;suggestion?:string|null;onDismissSuggestion?:()=>void}) {
  const [open,setOpen]=useState(false),[items,setItems]=useState<Memory[]>([]),[draft,setDraft]=useState(''),[editing,setEditing]=useState<Memory|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[loaded,setLoaded]=useState(false);
  const generation=useRef(0);
  useEffect(()=>{generation.current++;setOpen(false);setItems([]);setDraft('');setEditing(null);setLoaded(false);setBusy(false);setError('');return()=>{generation.current++;};},[userId]);
  async function refresh(){
    const epoch=generation.current;setBusy(true);setError('');setLoaded(false);
    try {const next=await listAssistantMemories(userId||undefined);if(epoch===generation.current){setItems(next);setLoaded(true);}}
    catch {if(epoch===generation.current)setError('Не удалось загрузить память. Проверь подключение и повтори.');}
    finally {if(epoch===generation.current)setBusy(false);}
  }
  async function change(action:()=>Promise<unknown>){
    if(busy)return;const epoch=generation.current;setBusy(true);setError('');
    try {await action();if(epoch!==generation.current)return;setDraft('');setEditing(null);onDismissSuggestion?.();const next=await listAssistantMemories(userId||undefined);if(epoch===generation.current)setItems(next);}
    catch {if(epoch===generation.current){setLoaded(false);setError('Изменение не подтверждено. Обнови память и попробуй ещё раз.');}}
    finally {if(epoch===generation.current)setBusy(false);}
  }
  const button=(label:string,onPress:()=>void,disabled=false)=><Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={{paddingHorizontal:14,paddingVertical:11,borderRadius:14,backgroundColor:panelSoft,opacity:disabled?0.5:1}}><Text style={{color:text,fontWeight:'600'}}>{label}</Text></Pressable>;
  if(!userId)return null;
  return <>
    <View style={{gap:8,alignItems:'flex-start'}}>
      {button('Память',()=>{setOpen(true);void refresh();})}
      {!!suggestion&&<View style={{backgroundColor:panelSoft,padding:14,borderRadius:18,gap:8,width:'100%'}}>
        <Text style={{color:muted,fontSize:12}}>Запомнить для чата, целей и квадратов?</Text>
        <Text style={{color:text}}>{suggestion}</Text>
        <View style={{flexDirection:'row',gap:8,flexWrap:'wrap'}}>{button('Посмотреть и сохранить',()=>{setDraft(suggestion);setEditing(null);setOpen(true);void refresh();})}{button('Не запоминать',()=>onDismissSuggestion?.())}</View>
      </View>}
    </View>
    <Modal visible={open} transparent animationType="fade" onRequestClose={()=>setOpen(false)}>
      <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.35)',justifyContent:'center',alignItems:'center',padding:20}}>
        <View style={{width:'100%',maxWidth:600,maxHeight:'90%',backgroundColor:panel,borderRadius:24,padding:20,gap:14}}>
          <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><Text accessibilityRole="header" style={{fontSize:23,fontWeight:'600',color:text}}>Память помощника</Text>{button('Закрыть',()=>setOpen(false))}</View>
          <Text style={{color:muted,fontSize:14,lineHeight:20}}>Общая для чата, целей и квадратов ОТАНИ, только в этом аккаунте. Здесь — подтверждённые факты, исправления ответов и предпочтения. Цели, действия и прогресс помощник учитывает автоматически; изменить их можно в разделе целей.</Text>
          <Text style={{color:muted,fontSize:12}}>Для ответа используем до 20 последних фактов в пределах объёма контекста. Удаление факта не удаляет сообщения в истории чата. Дневник в память не передаётся.</Text>
          {!!error&&<Text accessibilityLiveRegion="polite" style={{color:text}}>{error}</Text>}
          {busy&&<Text accessibilityLiveRegion="polite" style={{color:muted}}>Сохраняю или загружаю…</Text>}
          <ScrollView style={{flexGrow:0}} contentContainerStyle={{gap:12}} keyboardShouldPersistTaps="handled">
            {loaded&&!items.length&&<Text style={{color:muted}}>Пока ничего не запомнено. Добавь важное для планирования — например, сколько времени есть и что уже умеешь.</Text>}
            {items.map(item=><View key={item.id} style={{padding:14,borderWidth:1,borderColor:line,borderRadius:16,gap:10}}>
              <Text style={{color:text,lineHeight:21}}>{item.content}</Text>
              <View style={{flexDirection:'row',gap:8}}>{button('Изменить',()=>{setEditing(item);setDraft(item.content);},busy||!loaded)}{button('Удалить',()=>{void change(()=>deleteAssistantMemory(item.id,item.updatedAt,userId||undefined));},busy||!loaded)}</View>
            </View>)}
          </ScrollView>
          <TextInput accessibilityLabel={editing?'Исправить факт памяти':'Новый факт памяти'} placeholder="Например: могу заниматься по 20 минут вечером" placeholderTextColor={muted} multiline maxLength={1000} value={draft} onChangeText={setDraft} editable={!busy&&loaded} style={{minHeight:80,maxHeight:160,borderWidth:1,borderColor:line,borderRadius:14,padding:12,color:text}}/>
          <View style={{flexDirection:'row',gap:8,flexWrap:'wrap'}}>
            <Pressable accessibilityRole="button" disabled={busy||!loaded||!draft.trim()} onPress={()=>void change(()=>editing?updateAssistantMemory(editing.id,draft,editing.updatedAt,userId||undefined):addAssistantMemory(draft,userId||undefined))} style={{padding:13,borderRadius:14,backgroundColor:accent,opacity:busy||!loaded||!draft.trim()?0.5:1}}><Text style={{color:activeText,fontWeight:'600'}}>{editing?'Сохранить исправление':'Запомнить'}</Text></Pressable>
            {editing&&button('Отменить правку',()=>{setEditing(null);setDraft('');},busy)}
            {button('Обновить',()=>void refresh(),busy)}
          </View>
        </View>
      </View>
    </Modal>
  </>;
}
