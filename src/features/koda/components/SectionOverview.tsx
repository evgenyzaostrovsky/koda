import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ArrowUpRight, X } from 'lucide-react-native';
import { ink, inkText, lime, muted, panel, text } from '../theme';

export type OverviewTile = { key: string; title: string; value: string; detail: string; action: string; onPress: () => void; tone?: 'lime' | 'dark'; };

export function SectionOverview({title, tiles, children}: {title:string; tiles:OverviewTile[]; children?:ReactNode}) {
  const compact = useWindowDimensions().width < 760;
  return <ScrollView style={{flex:1,minHeight:0}} contentContainerStyle={s.center}>
    <View style={s.page}>
      <Text accessibilityRole="header" style={s.heading}>{title}</Text>
      {children}
      <View style={s.grid}>{tiles.map(tile => {
        const dark=tile.tone==='dark'; const foreground=dark?inkText:text;
        return <Pressable key={tile.key} accessibilityRole="button" accessibilityLabel={tile.action} onPress={tile.onPress}
          style={({pressed})=>[s.card,{width:compact?'48%':'49%',backgroundColor:dark?ink:tile.tone==='lime'?lime:panel},pressed&&{opacity:.8}]}>
          <View style={s.row}><Text style={[s.title,{color:foreground}]}>{tile.title}</Text><ArrowUpRight size={18} color={foreground}/></View>
          <Text numberOfLines={2} style={[s.value,{color:foreground}]}>{tile.value}</Text>
          <Text numberOfLines={2} style={[s.detail,{color:dark?'#d3ddca':muted}]}>{tile.detail}</Text>
          <Text numberOfLines={2} style={[s.action,{color:foreground}]}>{tile.action}</Text>
        </Pressable>;
      })}</View>
    </View>
  </ScrollView>;
}

export function SectionSheet({title,visible,onClose,children}: {title:string;visible:boolean;onClose:()=>void;children:ReactNode}) {
  return <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
    <View style={s.overlay}><View accessibilityViewIsModal style={s.sheet}>
      <View style={s.row}><Text accessibilityRole="header" style={s.title}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Закрыть: ${title}`} onPress={onClose} style={s.close}><X size={22} color={text}/></Pressable></View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:12,paddingBottom:8}}>{children}</ScrollView>
    </View></View>
  </Modal>;
}

const s=StyleSheet.create({
  center:{flexGrow:1,justifyContent:'center',alignItems:'center',paddingVertical:16},page:{width:'100%',maxWidth:1040,gap:12},
  heading:{fontSize:24,lineHeight:30,fontWeight:'600',letterSpacing:-.7,color:text},grid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',gap:12},
  card:{minHeight:178,borderRadius:24,padding:16,gap:10,justifyContent:'space-between',minWidth:0},row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
  title:{fontSize:14,lineHeight:19,fontWeight:'600',flexShrink:1,color:text},value:{fontSize:22,lineHeight:28,fontWeight:'500',letterSpacing:-.5},detail:{fontSize:12,lineHeight:17},action:{fontSize:12,lineHeight:17,fontWeight:'600'},
  overlay:{flex:1,padding:16,backgroundColor:'rgba(0,0,0,.55)',alignItems:'center',justifyContent:'center'},sheet:{width:'100%',maxWidth:760,maxHeight:'90%',backgroundColor:panel,borderRadius:24,padding:16,gap:12},close:{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'},
});
