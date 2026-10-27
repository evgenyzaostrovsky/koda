import type { ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { ArrowUpRight } from 'lucide-react-native';
import { NotchedWidget, type NotchedWidgetVariant } from './NotchedWidget';
import { ink, inkText, line, muted, panel, panelSoft, text } from '../theme';

export const bentoWidths={desktop:1320,day:1040,planner:1040,goals:960,progress:960,projects:880,habits:880,notes:840,journal:800,assistant:840,timer:640,settings:760} as const;
export const bentoTokens={gap:24,compactGap:16,radius:32,compactRadius:24,control:48,padding:24} as const;
export type BentoTone='light'|'soft'|'lime'|'dark';
const backgrounds:Record<BentoTone,string>={light:panel,soft:panelSoft,lime:'#e8ff55',dark:ink};
export function BentoPage({children,maxWidth=960,scroll=true,style,contentStyle,testID}:{children:ReactNode;maxWidth?:number;scroll?:boolean;style?:StyleProp<ViewStyle>;contentStyle?:StyleProp<ViewStyle>;testID?:string}){
 const compact=useWindowDimensions().width<680;
 const inner=<View testID={testID} style={[s.page,{maxWidth},contentStyle,compact&&{paddingHorizontal:0}]}>{children}</View>;
 return scroll?<ScrollView style={[{flex:1,minWidth:0},style]} contentContainerStyle={[s.scroll,{flexGrow:1,justifyContent:'center',paddingVertical:16}]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{inner}</ScrollView>:<View style={[s.page,{flex:1,maxWidth},style,contentStyle,compact&&{paddingHorizontal:0}]} testID={testID}>{children}</View>;
}
export function BentoGrid({children,columns=2,style}:{children:ReactNode;columns?:number;style?:StyleProp<ViewStyle>}){
 const wide=useWindowDimensions().width>=760;
 const grid=wide&&Platform.OS==='web'?{display:'grid',gridTemplateColumns:`repeat(${Math.max(1,columns)},minmax(0,1fr))`,gap:bentoTokens.gap} as unknown as ViewStyle:{gap:bentoTokens.compactGap};
 return <View style={[{minWidth:0,width:'100%'},grid,style]}>{children}</View>;
}
export function BentoCard({children,tone='light',variant='none',action,style,testID}:{children:ReactNode;tone?:BentoTone;variant?:NotchedWidgetVariant;action?:ReactNode;style?:StyleProp<ViewStyle>;testID?:string}){
 const compact=useWindowDimensions().width<680;
 return <NotchedWidget variant={variant} backgroundColor={backgrounds[tone]} action={action} style={[{padding:compact?20:24,gap:12,minWidth:0},style]} testID={testID??'bento-card'}>{children}</NotchedWidget>;
}
export const CompactWidget=BentoCard;
export const NotchedCard=BentoCard;
export function FloatingCardAction({label,onPress,icon,tone='light'}:{label:string;onPress:()=>void;icon?:ReactNode;tone?:BentoTone}){
 return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[s.action,{backgroundColor:backgrounds[tone]}]}>{icon??<ArrowUpRight size={22} color={tone==='dark'?inkText:text}/>}</Pressable>;
}
export function MetricCard({label,value,detail,tone='light',style,valueSize=32}:{label:string;value:string|number;detail?:string;tone?:BentoTone;style?:StyleProp<ViewStyle>;valueSize?:number}){
 const foreground=tone==='dark'?inkText:tone==='lime'?'#263c19':text;const secondary=tone==='dark'?'#c4cebb':tone==='lime'?'#435b31':muted;
 return <BentoCard tone={tone} style={style}><Text style={[s.label,{color:secondary}]}>{label}</Text><Text style={[s.value,{color:foreground,fontSize:valueSize,lineHeight:Math.round(valueSize*1.25)}]}>{value}</Text>{detail&&<Text style={[s.detail,{color:secondary}]}>{detail}</Text>}</BentoCard>;
}
export function SectionHeader({title,subtitle,action}:{title:string;subtitle?:string;action?:ReactNode}){
 return <View style={s.header}><View style={{flex:1,minWidth:0,gap:6}}><Text accessibilityRole="header" style={s.title}>{title}</Text>{subtitle&&<Text style={s.detail}>{subtitle}</Text>}</View>{action}</View>;
}
export function EmptyStateCard({title,description,action,children}:{title:string;description?:string;action?:ReactNode;children?:ReactNode}){
 return <BentoCard><Text style={s.emptyTitle}>{title}</Text>{description&&<Text style={s.detail}>{description}</Text>}{action}{children}</BentoCard>;
}
const s=StyleSheet.create({page:{width:'100%',alignSelf:'center',minWidth:0,gap:24},scroll:{paddingBottom:28,minWidth:0},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:16,flexWrap:'wrap',paddingTop:4},title:{fontSize:30,lineHeight:37,fontWeight:'500',letterSpacing:-0.8,color:text},detail:{fontSize:14,lineHeight:21,color:muted},label:{fontSize:13,lineHeight:19,color:muted},value:{fontSize:32,lineHeight:40,fontWeight:'500',letterSpacing:-1,color:text},action:{width:52,height:52,borderRadius:26,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:line},emptyTitle:{fontSize:21,lineHeight:28,fontWeight:'500',color:text}});
