import { useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { panel } from '../theme';

export type NotchedWidgetVariant = 'none' | 'top-right' | 'corner-action' | 'stepped';
/** The silhouette is a separate, non-interactive SVG. Content and action retain native hit targets. */
export function NotchedWidget({variant='none', backgroundColor=panel, action, children, style, testID}: {
 variant?:NotchedWidgetVariant; backgroundColor?:string; action?:ReactNode; children:ReactNode;
 style?:StyleProp<ViewStyle>; testID?:string;
}) {
 const [size,setSize]=useState({width:0,height:0});
 const mobile=useWindowDimensions().width<680;
 const shaped=!mobile&&variant!=='none'&&Boolean(action)&&size.width>160&&size.height>140;
 const radius=mobile?28:34;
 const w=size.width,h=size.height,r=radius;
 const deep=variant==='top-right'?88:variant==='stepped'?82:64;
 const bend=variant==='top-right'?40:28;
 const path=`M ${r} 0 H ${w-deep-22} Q ${w-deep} 0 ${w-deep} 22 V ${deep-bend} Q ${w-deep} ${deep} ${w-deep+bend} ${deep} H ${w-22} Q ${w} ${deep} ${w} ${deep+22} V ${h-r} Q ${w} ${h} ${w-r} ${h} H ${r} Q 0 ${h} 0 ${h-r} V ${r} Q 0 0 ${r} 0 Z`;
 return <View testID={testID} onLayout={event=>{const {width,height}=event.nativeEvent.layout;setSize(previous=>previous.width===width&&previous.height===height?previous:{width,height});}} style={[s.root,{borderRadius:radius},!shaped&&{backgroundColor},style]}>
  {shaped&&<View pointerEvents="none" style={StyleSheet.absoluteFill}><Svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" accessible={false}><Path d={path} fill={backgroundColor}/></Svg></View>}
  {children}
  {action&&<View style={[s.action,shaped?{top:3,right:3}:{top:mobile?18:22,right:mobile?18:22}]}>{action}</View>}
 </View>;
}
const s=StyleSheet.create({root:{position:'relative',minWidth:0,...(Platform.OS==='web'?{filter:'drop-shadow(0 7px 14px rgba(26,45,34,0.07))'} as ViewStyle:{})},action:{position:'absolute',zIndex:2,alignItems:'center',justifyContent:'center'}});
