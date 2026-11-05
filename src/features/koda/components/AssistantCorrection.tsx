import {useEffect,useRef,useState} from 'react';
import {Modal,Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import {saveAssistantCorrection} from '../../../services/assistantMemory';
import {buildAssistantCorrectionMemory} from '../../../ai/assistantCorrections';
import {accent,activeText,line,muted,panel,panelSoft,text} from '../theme';

type Props={userId?:string|null;source:'chat'|'goal'|'otani';before:string;initialAfter?:string;preferenceHint?:string;buttonLabel?:string;onSaved?:()=>void};
export function AssistantCorrection({userId,source,before,initialAfter='',preferenceHint,buttonLabel='Исправить ответ',onSaved}:Props){
  const [open,setOpen]=useState(false),[after,setAfter]=useState(initialAfter),[preference,setPreference]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false),[error,setError]=useState('');
  const generation=useRef(0),busyRef=useRef(false);
  useEffect(()=>{generation.current++;busyRef.current=false;setOpen(false);setAfter(initialAfter);setPreference('');setBusy(false);setSaved(false);setError('');return()=>{generation.current++;};},[userId,before,initialAfter]);
  const ownerId=userId||'';
  if(!ownerId)return null;
  let memoryPreview='',previewError='';
  try{memoryPreview=buildAssistantCorrectionMemory({source,before,after,preference:preference.trim()||undefined});}
  catch(error){previewError=error instanceof Error?error.message:'Проверь исходный и исправленный текст.';}
  async function submit(){
    const corrected=after.trim();if(!corrected||!memoryPreview||previewError||busyRef.current)return;
    busyRef.current=true;const epoch=generation.current,owner=ownerId;setBusy(true);setError('');
    try{await saveAssistantCorrection({ownerId:owner,source,before,after:corrected, ...(preference.trim()?{preference:preference.trim()}:{})});if(epoch!==generation.current)return;setSaved(true);setOpen(false);onSaved?.();}
    catch{if(epoch===generation.current)setError('Не удалось подтвердить сохранение. Обнови память перед новой попыткой.');}
    finally{if(epoch===generation.current){busyRef.current=false;setBusy(false);}}
  }
  const button=(label:string,onPress:()=>void,disabled=false)=><Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={{alignSelf:'flex-start',minHeight:40,justifyContent:'center',paddingHorizontal:10,opacity:disabled?0.5:1}}><Text style={{color:accent,fontSize:13,fontWeight:'600'}}>{label}</Text></Pressable>;
  return <View>
    {saved?<Text accessibilityLiveRegion="polite" style={{color:muted,fontSize:12,paddingVertical:6}}>Исправление сохранено в общей памяти помощника.</Text>:button(buttonLabel,()=>{setAfter(initialAfter||before);setOpen(true);setError('');})}
    {!!error&&!open&&<Text accessibilityLiveRegion="polite" style={{color:muted,fontSize:12}}>{error}</Text>}
    <Modal transparent visible={open} animationType="fade" onRequestClose={()=>!busy&&setOpen(false)}>
      <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.38)',justifyContent:'center',alignItems:'center',padding:18}}>
        <View accessibilityViewIsModal style={{width:'100%',maxWidth:620,maxHeight:'90%',backgroundColor:panel,borderColor:line,borderWidth:1,borderRadius:20,padding:18}}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:12}}>
          <Text accessibilityRole="header" style={{color:text,fontSize:19,fontWeight:'700'}}>Исправить ответ KODA</Text>
          <Text style={{color:muted,fontSize:13,lineHeight:19}}>Исправление запомнится для чата, целей и квадратов ОТАНИ в этом аккаунте. Оно не меняет эту цель или историю переписки. Перед сохранением можно проверить точный компактный текст, который попадёт в память.</Text>
          <Text style={{color:text,fontSize:13,fontWeight:'600'}}>Какой ответ был</Text><Text numberOfLines={5} style={{color:muted,fontSize:13,lineHeight:18,backgroundColor:panelSoft,padding:10,borderRadius:12}}>{before.slice(0,1600)}</Text>{before.length>1600&&<Text style={{color:muted,fontSize:12}}>Здесь показана часть исходной сводки. Точная компактная версия для памяти — ниже.</Text>}
          <Text style={{color:text,fontSize:13,fontWeight:'600'}}>Как правильно</Text>
          <TextInput accessibilityLabel="Исправленный ответ" value={after} onChangeText={setAfter} editable={!busy} multiline maxLength={12000} style={{minHeight:110,maxHeight:210,textAlignVertical:'top',borderColor:line,borderWidth:1,borderRadius:12,padding:11,color:text,fontSize:14}} />
          <TextInput accessibilityLabel="Правило или причина исправления (необязательно)" value={preference} onChangeText={setPreference} editable={!busy} multiline maxLength={1000} placeholder={preferenceHint||'Почему это важно или как отвечать в будущем? (необязательно)'} placeholderTextColor={muted} style={{minHeight:58,maxHeight:120,textAlignVertical:'top',borderColor:line,borderWidth:1,borderRadius:12,padding:11,color:text,fontSize:14}} />
          {!!previewError&&<Text accessibilityLiveRegion="polite" style={{color:text,fontSize:13}}>{previewError}</Text>}
          <Text style={{color:text,fontSize:13,fontWeight:'600'}}>В память попадёт</Text>
          <Text selectable style={{color:muted,fontSize:12,lineHeight:17,backgroundColor:panelSoft,padding:10,borderRadius:12}}>{memoryPreview||'Добавь исправленный вариант, чтобы увидеть сводку.'}</Text>
          {!!error&&<Text accessibilityLiveRegion="polite" style={{color:text,fontSize:13}}>{error}</Text>}
          <View style={{flexDirection:'row',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}>
            {button('Отмена',()=>setOpen(false),busy)}
            <Pressable accessibilityRole="button" accessibilityState={{disabled:busy||!memoryPreview||Boolean(previewError)}} disabled={busy||!memoryPreview||Boolean(previewError)} onPress={()=>void submit()} style={{minHeight:44,justifyContent:'center',paddingHorizontal:14,borderRadius:12,backgroundColor:accent,opacity:busy||!memoryPreview||Boolean(previewError)?0.5:1}}><Text style={{color:activeText,fontWeight:'700'}}>{busy?'Сохраняю…':'Запомнить исправление'}</Text></Pressable>
          </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  </View>;
}
