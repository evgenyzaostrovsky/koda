import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { CalendarDays, Check, Clock3 } from 'lucide-react-native';
import type { GoalAction, GoalMilestone } from '../types';
import { calculateMilestoneProgress, formatDateLong, sortGoalActions } from '../goalLogic';
import { accent, activeBg, activeText, line, muted, panel, panelSoft, text } from '../theme';
import { BentoCard } from './Bento';

type Patch = Partial<Pick<GoalMilestone, 'title' | 'description' | 'deadline' | 'status'>>;
export function GoalRoadmap({
  milestones, actions, currentMilestoneId, focusMilestoneId, manage, onUpdateMilestone, onToggleAction, onAddAction, renderManageActions,
}: {
  milestones: GoalMilestone[];
  actions: GoalAction[];
  currentMilestoneId?: string;
  focusMilestoneId?: string | null;
  manage: boolean;
  onUpdateMilestone: (id: string, patch: Patch) => void;
  onToggleAction: (actionId: string) => void;
  onAddAction?: (milestone: GoalMilestone) => void;
  renderManageActions?: (milestone: GoalMilestone, index: number, ordered: GoalMilestone[]) => React.ReactNode;
}) {
  const compact = useWindowDimensions().width < 680;
  const ordered = [...milestones].sort((a,b)=>a.position-b.position);
  const [expandedId, setExpandedId] = useState<string | null>(currentMilestoneId ?? ordered[0]?.id ?? null);
  useEffect(()=>{ if (focusMilestoneId) setExpandedId(focusMilestoneId); else if (currentMilestoneId && !expandedId) setExpandedId(currentMilestoneId); },[focusMilestoneId,currentMilestoneId,expandedId]);
  const expanded = ordered.find(stage=>stage.id===expandedId);
  const expandedIndex = expanded ? ordered.findIndex(stage=>stage.id===expanded.id) : -1;
  const expandedProgress = expanded ? calculateMilestoneProgress(expanded,actions) : 0;
  const attached = expanded ? actions.filter(action=>action.milestoneId===expanded.id&&!action.archivedAt).sort(sortGoalActions) : [];

  return <BentoCard tone="light" style={s.surface} testID="goal-roadmap">
    <ScrollView horizontal={!compact} showsHorizontalScrollIndicator={!compact&&ordered.length>4} showsVerticalScrollIndicator={false} contentContainerStyle={[s.route, compact&&s.routeStack, !compact&&ordered.length>4&&s.routeLong]}>
      {ordered.map((stage,index)=>{
        const progress=calculateMilestoneProgress(stage,actions);
        const isCurrent=stage.id===currentMilestoneId;
        const done=stage.status==='completed'||progress===100;
        const open=expandedId===stage.id;
        return <View key={stage.id} style={[s.nodeWrap,compact?s.nodeStack:ordered.length>4?s.nodeLong:s.nodeEven]}>
          {index<ordered.length-1?<View style={[compact?s.verticalConnector:s.horizontalConnector,done&&s.connectorDone]}/>:null}
          <Pressable accessibilityRole="button" accessibilityLabel={`Этап ${index+1}: ${stage.title}, ${done?'завершён':isCurrent?'текущий':'впереди'}`} accessibilityState={{expanded:open,selected:isCurrent}} aria-expanded={open} onPress={()=>setExpandedId(open?null:stage.id)} style={[s.nodeHeader,!compact&&s.nodeHeaderDesktop,open&&s.nodeOpen]}>
            <View style={[s.marker,isCurrent&&s.markerCurrent,done&&s.markerDone,open&&s.markerOpen]}>{done?<Check size={17} color={activeText}/>:<Text style={[s.markerNumber,isCurrent&&s.markerNumberCurrent]}>{index+1}</Text>}</View>
            <View style={[s.nodeCopy,!compact&&s.nodeCopyDesktop]}><Text numberOfLines={2} style={[s.nodeTitle,!compact&&s.nodeTitleDesktop]}>{stage.title}</Text><Text style={[s.nodeState,isCurrent&&s.nodeStateCurrent,!compact&&s.nodeStateDesktop]}>{done?'Завершён':isCurrent?'Сейчас':'Впереди'} · {progress}%</Text></View>
          </Pressable>
        </View>;
      })}
    </ScrollView>
    {expanded?<View style={s.details}>
      <View style={s.detailHeading}><View style={s.detailCopy}><Text accessibilityRole="header" style={s.detailTitle}>{expanded.title}</Text><Text style={s.detailProgress}>{expandedIndex+1} из {ordered.length} этапов · {expandedProgress}%</Text></View><Text style={s.detailStatus}>{expandedProgress===100?'Завершён':expanded.id===currentMilestoneId?'Сейчас':'Впереди'}</Text></View>
      <View accessibilityRole="progressbar" accessibilityLabel={`Прогресс этапа ${expanded.title}`} accessibilityValue={{min:0,max:100,now:expandedProgress}} style={s.progressTrack}><View style={[s.progressFill,{width:`${expandedProgress}%`}]}/></View>
      {manage?<View style={s.fieldGroup}>
        <TextInput accessibilityLabel={`Описание этапа ${expanded.title}`} multiline value={expanded.description} onChangeText={value=>onUpdateMilestone(expanded.id,{description:value.slice(0,1000)})} placeholder="Коротко опиши результат этапа" placeholderTextColor={muted} style={[s.descriptionInput,!expanded.description&&s.emptyInput]}/>
        <View style={s.deadlineRow}><CalendarDays size={15} color={muted}/><TextInput accessibilityLabel={`Срок этапа ${expanded.title}`} value={expanded.deadline} onChangeText={value=>onUpdateMilestone(expanded.id,{deadline:value.slice(0,10)})} placeholder="Срок · ГГГГ-ММ-ДД" placeholderTextColor={muted} style={s.deadlineInput}/></View>
      </View>:<>
        {expanded.description?<Text style={s.description}>{expanded.description}</Text>:null}
        {expanded.deadline?<View style={s.deadlineRead}><Clock3 size={14} color={muted}/><Text style={s.deadlineText}>{formatDateLong(expanded.deadline)}</Text></View>:null}
      </>}
      {manage&&renderManageActions?<View style={s.tools}>{renderManageActions(expanded,expandedIndex,ordered)}</View>:null}
      <View style={s.actionList}>
        {attached.length?attached.map(action=><Pressable key={action.id} accessibilityRole="checkbox" accessibilityLabel={action.title} accessibilityState={{checked:action.status==='completed'}} aria-checked={action.status==='completed'} onPress={()=>onToggleAction(action.id)} style={s.actionRow}><View style={[s.actionCheck,action.status==='completed'&&s.actionCheckDone]}>{action.status==='completed'?<Check size={12} color={activeText}/>:null}</View><Text style={[s.actionTitle,action.status==='completed'&&s.actionTitleDone]}>{action.title}</Text></Pressable>):<Text style={s.noActions}>У этого этапа пока нет связанных действий.</Text>}
      </View>
      {expanded.id===currentMilestoneId&&!attached.length&&onAddAction?<Pressable accessibilityRole="button" onPress={()=>onAddAction(expanded)} style={s.addAction}><Text style={s.addActionText}>Добавить действие к текущему этапу</Text></Pressable>:null}
    </View>:null}
  </BentoCard>;
}

const s=StyleSheet.create({
 surface:{gap:16,minWidth:0},route:{alignItems:'flex-start',flexDirection:'row',flexGrow:1,gap:0,minWidth:0,width:'100%'},routeLong:{width:'auto'},routeStack:{alignItems:'stretch',flexDirection:'column',gap:0,width:'100%'},
 nodeWrap:{minWidth:0,position:'relative'},nodeEven:{flex:1},nodeLong:{minWidth:190,width:190},nodeStack:{minHeight:72,paddingLeft:0,paddingBottom:8,width:'100%'},
 nodeHeader:{alignItems:'center',flexDirection:'row',gap:11,minHeight:72,paddingHorizontal:6,paddingVertical:8,zIndex:1},nodeHeaderDesktop:{flexDirection:'column',gap:7,minHeight:104,justifyContent:'flex-start'},nodeOpen:{backgroundColor:'transparent',borderRadius:16},nodeCopy:{flex:1,gap:4,minWidth:0},nodeCopyDesktop:{alignItems:'center',justifyContent:'flex-start'},nodeTitle:{color:text,fontSize:14,fontWeight:'600',lineHeight:19},nodeTitleDesktop:{textAlign:'center'},nodeState:{color:muted,fontSize:12,lineHeight:17},nodeStateDesktop:{textAlign:'center'},nodeStateCurrent:{color:accent,fontWeight:'700'},marker:{alignItems:'center',backgroundColor:panel,borderColor:line,borderRadius:999,borderWidth:1,height:40,justifyContent:'center',width:40},markerCurrent:{backgroundColor:'#e8ff55',borderColor:'#a5bd35',borderWidth:2},markerDone:{backgroundColor:activeBg,borderColor:activeBg},markerOpen:{borderColor:accent,borderWidth:2},markerNumber:{color:muted,fontSize:13,fontWeight:'700'},markerNumberCurrent:{color:'#263c19'},horizontalConnector:{backgroundColor:line,height:2,left:'50%',position:'absolute',right:'-50%',top:27,zIndex:0},verticalConnector:{backgroundColor:line,bottom:-28,left:19,position:'absolute',top:48,width:2},connectorDone:{backgroundColor:accent},
 details:{borderTopColor:line,borderTopWidth:1,gap:12,paddingTop:16},detailHeading:{alignItems:'flex-start',flexDirection:'row',gap:12,justifyContent:'space-between'},detailCopy:{flex:1,gap:3,minWidth:0},detailTitle:{color:text,fontSize:17,fontWeight:'600',lineHeight:23},detailProgress:{color:muted,fontSize:12,lineHeight:17},detailStatus:{color:accent,fontSize:12,fontWeight:'700'},progressTrack:{backgroundColor:panelSoft,borderRadius:999,height:7,overflow:'hidden',width:'100%'},progressFill:{backgroundColor:accent,borderRadius:999,height:7},description:{color:text,fontSize:14,lineHeight:21},fieldGroup:{gap:8},descriptionInput:{backgroundColor:panelSoft,borderColor:line,borderRadius:12,borderWidth:1,color:text,fontSize:14,lineHeight:20,minHeight:70,padding:11,textAlignVertical:'top'},emptyInput:{fontStyle:'italic'},deadlineRow:{alignItems:'center',backgroundColor:panelSoft,borderColor:line,borderRadius:12,borderWidth:1,flexDirection:'row',gap:8,minHeight:44,paddingHorizontal:11},deadlineInput:{color:text,flex:1,fontSize:13,minHeight:42},deadlineRead:{alignItems:'center',flexDirection:'row',gap:6},deadlineText:{color:muted,fontSize:12},tools:{gap:8},actionList:{gap:7},actionRow:{alignItems:'center',flexDirection:'row',gap:10,minHeight:44},actionCheck:{alignItems:'center',borderColor:line,borderRadius:6,borderWidth:1,height:20,justifyContent:'center',width:20},actionCheckDone:{backgroundColor:activeBg,borderColor:activeBg},actionTitle:{color:text,flex:1,fontSize:14,lineHeight:20},actionTitleDone:{color:muted,textDecorationLine:'line-through'},noActions:{color:muted,fontSize:13,lineHeight:19},addAction:{alignSelf:'flex-start',borderColor:accent,borderRadius:999,borderWidth:1,justifyContent:'center',minHeight:44,paddingHorizontal:16},addActionText:{color:accent,fontSize:13,fontWeight:'700'},
});
