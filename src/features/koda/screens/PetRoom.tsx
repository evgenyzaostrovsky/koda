import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { ArrowLeft, Check, Heart, House, Leaf, Sparkles, Utensils, WandSparkles } from 'lucide-react-native';
import { PetCompanion, type PetLifeState, type PetPose } from '../components/PetCompanion';
import { accent, accentSoft, activeBg, activeText, line, muted, panel, panelSoft, text } from '../theme';

export type PetRoomUnlock = {
  id: string;
  name: string;
  description?: string;
  image?: string;
};

export type PetRoomProps = {
  pet: {
    name: string;
    state: PetLifeState;
    /** Hunger from 0 (satisfied) to 100 (very hungry). */
    hunger: number;
    pose?: PetPose;
  };
  /** Spendable portions currently available. */
  food: number;
  /** Optional model decision; falls back to a hungry pet with food available. */
  canFeed?: boolean;
  /** Optional time after which the pet may die if not fed. */
  lifeDeadline?: string;
  /** Optional lifetime total; omitted values are not invented by this screen. */
  earnedActions?: number;
  nextUnlockText?: string;
  artifacts?: PetRoomUnlock[];
  cosmetics?: PetRoomUnlock[];
  roomUpgrades?: PetRoomUnlock[];
  equippedCosmeticId?: string;
  equippedUpgradeIds?: string[];
  onAdopt: () => void;
  onFeed: () => void;
  onRebirth: () => void;
  onRename?: (name: string) => void;
  onSelectCosmetic: (id: string) => void;
  onSelectUpgrade: (id: string) => void;
  onClose?: () => void;
};

export function PetRoom({
  pet, food, canFeed, lifeDeadline, earnedActions, nextUnlockText, artifacts = [], cosmetics = [], roomUpgrades = [], equippedCosmeticId,
  equippedUpgradeIds = [], onAdopt, onFeed, onRebirth, onRename, onSelectCosmetic, onSelectUpgrade, onClose,
}: PetRoomProps) {
  const { width } = useWindowDimensions();
  const wide = width >= 740;
  const hunger = Math.max(0, Math.min(100, pet.hunger));
  const [collectionTab, setCollectionTab] = useState<'room' | 'look' | 'artifacts'>('room');
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const isEgg = pet.state === 'egg';
  const isDead = pet.state === 'dead';
  const hungry = hunger >= 55;
  const needFood = food <= 0;
  const canFeedNow = canFeed ?? (!needFood && hungry);
  const roomDecoration = equippedUpgradeIds.find(id => id === 'scarf' || id === 'bow' || id === 'crown');
  const deadlineLabel = lifeDeadline ? formatDeadline(lifeDeadline) : null;

  return <ScrollView style={s.root} contentContainerStyle={[s.content, !wide && s.contentCompact]}>
    <View style={s.header}>
      <View style={s.headingGroup}>
        {onClose && <Pressable accessibilityRole="button" accessibilityLabel="Назад" onPress={onClose} style={s.back}><ArrowLeft size={19} color={accent} /></Pressable>}
        <View style={{ flexShrink: 1 }}>
          <Text style={s.title}>{isEgg ? 'Место для питомца' : `Домик ${pet.name}`}</Text>
          <Text style={s.subtitle}>Тихое место для маленьких радостей</Text>
        </View>
      </View>
      <View style={s.foodPill} accessibilityLabel={`Еда: ${food} ${portionWord(food)}`}>
        <Utensils size={15} color={accent} /><Text style={s.foodText}>{food} {portionWord(food)}</Text>
      </View>
    </View>


    <View style={[s.room, wide && s.roomWide]}>
      <View style={[s.scene, wide ? s.sceneWide : s.sceneCompact]}>
        <View style={s.sceneArch} />
        <View style={s.sceneHalo} />
        <View style={s.floorShadow} />
        {isEgg
          ? <PetCompanion name={pet.name || 'питомец'} state="alive" pose={pet.pose} size={wide ? 202 : 150} />
          : <PetCompanion name={pet.name} state={pet.state} pose={pet.pose} size={wide ? 202 : 150} />}
        {roomDecoration && <RoomDecoration kind={roomDecoration} />}
        <View style={s.sceneCaption}>
          <Leaf size={14} color="#667a4f" />
          <Text style={s.captionText}>{isEgg ? 'Здесь начнётся ваша история' : isDead ? 'Спасибо за всё прожитое вместе' : 'Здесь можно просто побыть рядом'}</Text>
        </View>
      </View>

      <View style={[s.care, wide ? s.careWide : s.careCompact]}>
        {isEgg ? <>
          <View style={s.stateMark}><Sparkles size={16} color={accent} /><Text style={s.stateLabel}>ПЕРВЫЙ ШАГ</Text></View>
          <Text style={s.careTitle}>Тут ждёт новый друг</Text>
          <Text style={s.careCopy}>Когда будешь готов(а), можно познакомиться с питомцем. Торопиться не нужно.</Text>
          <LifeCycleHint deadlineLabel={null} />
          <Pressable accessibilityRole="button" onPress={onAdopt} style={({ pressed }) => [s.primary, pressed && s.pressed]}>
            <Heart size={17} color={activeText} /><Text style={s.primaryText}>Встретить питомца</Text>
          </Pressable>
        </> : isDead ? <>
          <View style={s.stateMark}><Leaf size={16} color={accent} /><Text style={s.stateLabel}>ПАМЯТЬ</Text></View>
          <Text style={s.careTitle}>Путь {pet.name} завершился</Text>
          <Text style={s.careCopy}>Можно сохранить тёплые воспоминания. К новой главе можно вернуться, когда будет удобно.</Text>
          <Pressable accessibilityRole="button" onPress={onRebirth} style={({ pressed }) => [s.primary, pressed && s.pressed]}>
            <Sparkles size={17} color={activeText} /><Text style={s.primaryText}>Начать новую жизнь</Text>
          </Pressable>
        </> : <>
          <View style={s.stateMark}><Heart size={16} color={hungry ? '#9a6c3e' : accent} /><Text style={s.stateLabel}>{hungry ? 'ПОРА ПОЗАБОТИТЬСЯ' : 'ДОМА'}</Text></View>
          <Text style={s.careTitle}>{hungry ? 'Питомец проголодался' : `${pet.name} рядом`}</Text>
          <Text style={s.careCopy}>{hungry ? 'Порция еды поможет ему почувствовать себя лучше.' : 'Всё спокойно. Можно зайти в гости или угостить чем-нибудь.'}</Text>
          <View style={s.hungerBlock}>
            <View style={s.hungerTop}><Text style={s.hungerLabel}>Голод</Text><Text style={s.hungerValue}>{hunger}%</Text></View>
            <View accessibilityRole="progressbar" accessibilityLabel="Уровень голода" accessibilityValue={{ min: 0, max: 100, now: hunger }} style={s.track}>
              <View style={[s.fill, { width: `${hunger}%`, backgroundColor: hunger >= 70 ? '#b88b53' : accent }]} />
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canFeedNow }}
            disabled={!canFeedNow}
            onPress={onFeed}
            style={({ pressed }) => [s.primary, !canFeedNow && s.primaryDisabled, pressed && s.pressed]}
          >
            <Utensils size={17} color={!canFeedNow ? muted : activeText} />
            <Text style={[s.primaryText, !canFeedNow && s.disabledText]}>{needFood ? 'Порций пока нет' : canFeedNow ? 'Покормить питомца' : 'Питомец сыт'}</Text>
          </Pressable>
          <LifeCycleHint deadlineLabel={deadlineLabel} />
          {typeof earnedActions === 'number' && <Text style={s.earned}>Наград за выполненные дела: {earnedActions}</Text>}
        </>}
      </View>
    </View>

    <Pressable accessibilityRole="button" accessibilityState={{expanded:collectionOpen}} onPress={()=>setCollectionOpen(value=>!value)} style={s.collectionToggle}><Text style={s.sectionTitle}>{collectionOpen ? 'Скрыть вещи' : 'Украшения и находки'}</Text><Text style={s.unlockAction}>{collectionOpen ? 'Свернуть' : 'Открыть →'}</Text></Pressable>
    {collectionOpen && <View style={s.collection}>
      <View style={s.collectionHeader}>
        <Text style={s.sectionTitle}>Сделать домик своим</Text>
        <View style={s.tabs} accessibilityRole="tablist">
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: collectionTab === 'room' }} onPress={() => setCollectionTab('room')} style={[s.tab, collectionTab === 'room' && s.tabSelected]}>
            <House size={14} color={collectionTab === 'room' ? activeText : muted} /><Text style={[s.tabText, collectionTab === 'room' && s.tabTextSelected]}>Комната</Text>
          </Pressable>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: collectionTab === 'look' }} onPress={() => setCollectionTab('look')} style={[s.tab, collectionTab === 'look' && s.tabSelected]}>
            <WandSparkles size={14} color={collectionTab === 'look' ? activeText : muted} /><Text style={[s.tabText, collectionTab === 'look' && s.tabTextSelected]}>Образ</Text>
          </Pressable>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: collectionTab === 'artifacts' }} onPress={() => setCollectionTab('artifacts')} style={[s.tab, collectionTab === 'artifacts' && s.tabSelected]}>
            <Sparkles size={14} color={collectionTab === 'artifacts' ? activeText : muted} /><Text style={[s.tabText, collectionTab === 'artifacts' && s.tabTextSelected]}>Находки</Text>
          </Pressable>
        </View>
      </View>
      <Text style={s.sectionCopy}>Новые вещи открываются за выполненные дела и привычки.</Text>
      {nextUnlockText ? <Text style={s.sectionCopy}>{nextUnlockText}</Text> : null}
    {!isEgg && onRename && <View style={s.nameEditor}>
      {renaming ? <><TextInput accessibilityLabel="Имя питомца" value={nameDraft} onChangeText={setNameDraft} maxLength={32} style={s.nameInput} />
        <Pressable accessibilityRole="button" disabled={!nameDraft.trim()} onPress={()=>{onRename(nameDraft.trim());setRenaming(false);}} style={s.nameButton}><Text style={s.nameButtonText}>Сохранить</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={()=>setRenaming(false)} style={s.nameButton}><Text style={s.nameButtonText}>Отмена</Text></Pressable></>
      : <Pressable accessibilityRole="button" onPress={()=>{setNameDraft(pet.name);setRenaming(true);}} style={s.nameButton}><Text style={s.nameButtonText}>Изменить имя</Text></Pressable>}
    </View>}
      {collectionTab === 'room'
        ? <UnlockList items={roomUpgrades} equippedIds={equippedUpgradeIds} kind="room" onSelect={onSelectUpgrade} />
        : collectionTab === 'look'
          ? <UnlockList items={cosmetics} equippedIds={equippedCosmeticId ? [equippedCosmeticId] : []} kind="look" onSelect={onSelectCosmetic} />
          : <ArtifactList items={artifacts} />}
    </View>}
  </ScrollView>;
}

function portionWord(value:number) {
  const lastTwo=value%100, last=value%10;
  return lastTwo>=11&&lastTwo<=14?'порций':last===1?'порция':last>=2&&last<=4?'порции':'порций';
}

function ArtifactList({ items }: { items: PetRoomUnlock[] }) {
  if (!items.length) return <View style={s.emptyCollection}>
    <View style={s.emptyIcon}><Sparkles size={18} color={accent} /></View>
    <View style={s.emptyWords}>
      <Text style={s.emptyTitle}>Пока нет находок</Text>
      <Text style={s.emptyCopy}>Награды за дела и привычки будут собраны здесь.</Text>
    </View>
  </View>;
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.items}>
    {items.map(item => <View key={item.id} accessibilityLabel={`${item.name}${item.description ? `: ${item.description}` : ''}`} style={s.unlock}>
      <View style={s.unlockIcon}><Sparkles size={18} color={accent} /></View>
      <Text numberOfLines={1} style={s.unlockName}>{item.name}</Text>
      {!!item.description && <Text numberOfLines={3} style={s.unlockCopy}>{item.description}</Text>}
      <Text style={s.unlockAction}>В коллекции</Text>
    </View>)}
  </ScrollView>;
}

function LifeCycleHint({ deadlineLabel }: { deadlineLabel: string | null }) {
  return <View style={s.lifeHint}>
    <Text style={s.lifeHintText}>Если не кормить питомца 7 дней после встречи или последнего кормления, он погибнет. Еда появляется за выполненные дела и привычки.</Text>
    {deadlineLabel && <Text style={s.deadline}>Если не покормить до {deadlineLabel}, питомец может погибнуть.</Text>}
  </View>;
}

function formatDeadline(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

function RoomDecoration({ kind }: { kind: 'scarf' | 'bow' | 'crown' }) {
  if (kind === 'scarf') return <View accessibilityLabel="Мягкая подушка" style={[s.roomDecoration, s.pillow]}>
    <View style={s.pillowFold} />
  </View>;
  if (kind === 'bow') return <View accessibilityLabel="Растение" style={[s.roomDecoration, s.plant]}>
    <Leaf size={28} color="#62794b" />
    <View style={s.pot} />
  </View>;
  return <View accessibilityLabel="Фонарик" style={[s.roomDecoration, s.lantern]}>
    <View style={s.lanternHandle} />
    <View style={s.lanternBody}><Sparkles size={17} color="#9a7446" /></View>
    <View style={s.lanternBase} />
  </View>;
}

function UnlockList({ items, equippedIds, kind, onSelect }: { items: PetRoomUnlock[]; equippedIds: string[]; kind: 'room' | 'look'; onSelect: (id: string) => void }) {
  if (!items.length) return <View style={s.emptyCollection}>
    <View style={s.emptyIcon}>{kind === 'room' ? <House size={18} color={accent} /> : <WandSparkles size={18} color={accent} />}</View>
    <View style={s.emptyWords}>
      <Text style={s.emptyTitle}>{kind === 'room' ? 'В комнате пока тихо' : 'Пока нет новых образов'}</Text>
      <Text style={s.emptyCopy}>Продолжай в своём темпе — награды появятся здесь.</Text>
    </View>
  </View>;
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.items}>
    {items.map((item) => {
      const selected = equippedIds.includes(item.id);
      return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.name}${selected ? ', выбрано' : ', выбрать'}`} accessibilityState={{ selected }} onPress={() => onSelect(item.id)} style={({ pressed }) => [s.unlock, selected && s.unlockSelected, pressed && s.pressed]}>
        <View style={[s.unlockIcon, selected && s.unlockIconSelected]}>{selected ? <Check size={18} color={activeText} /> : kind === 'room' ? <House size={18} color={accent} /> : <WandSparkles size={18} color={accent} />}</View>
        <Text numberOfLines={1} style={s.unlockName}>{item.name}</Text>
        {!!item.description && <Text numberOfLines={2} style={s.unlockCopy}>{item.description}</Text>}
        <Text style={s.unlockAction}>{selected ? 'Выбрано' : 'Выбрать'}</Text>
      </Pressable>;
    })}
  </ScrollView>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  content: { width: '100%', maxWidth: 940, alignSelf: 'center', padding: 22, paddingBottom: 36, gap: 16 },
  contentCompact: { padding: 14, gap: 12 },
  header: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headingGroup: { flexDirection: 'row', alignItems: 'center', gap: 11, flexShrink: 1 },
  back: { width: 44, height: 44, borderRadius: 16, backgroundColor: panel, borderWidth: 1, borderColor: line, alignItems: 'center', justifyContent: 'center' },
  title: { color: text, fontSize: 23, lineHeight: 29, fontWeight: '700', letterSpacing: -.45 },
  subtitle: { color: muted, fontSize: 13, lineHeight: 19, marginTop: 1 },
  foodPill: { minHeight: 40, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: line, backgroundColor: panel, flexDirection: 'row', alignItems: 'center', gap: 7 },
  foodText: { color: text, fontSize: 13, fontWeight: '600' },
  room: { borderRadius: 28, backgroundColor: panel, borderWidth: 1, borderColor: line, overflow: 'hidden' },
  roomWide: { flexDirection: 'row', minHeight: 294 },
  scene: { minHeight: 250, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: '#eff1e5' },
  sceneCompact: { minHeight: 178 },
  sceneWide: { width: '52%', minHeight: 294 },
  sceneArch: { position: 'absolute', width: 280, height: 252, bottom: 7, borderTopLeftRadius: 150, borderTopRightRadius: 150, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, backgroundColor: '#e2e7d5' },
  sceneHalo: { position: 'absolute', width: 182, height: 182, borderRadius: 100, backgroundColor: '#f5f4e9', top: 24, opacity: .9 },
  floorShadow: { position: 'absolute', width: 162, height: 25, borderRadius: 999, backgroundColor: '#cbd3b7', bottom: 38, opacity: .55 },
  sceneCaption: { position: 'absolute', bottom: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: 12 },
  captionText: { color: '#46543a', fontSize: 12, lineHeight: 17, textAlign: 'center' },
  care: { padding: 20, gap: 9 },
  careCompact: { padding: 14, gap: 6 },
  careWide: { flex: 1, justifyContent: 'center', padding: 24 },
  stateMark: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 1 },
  stateLabel: { color: muted, fontSize: 11, fontWeight: '700', letterSpacing: .8 },
  careTitle: { color: text, fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -.3 },
  careCopy: { color: muted, fontSize: 14, lineHeight: 21 },
  hungerBlock: { gap: 7, marginTop: 4, marginBottom: 2 },
  hungerTop: { flexDirection: 'row', justifyContent: 'space-between' },
  hungerLabel: { color: muted, fontSize: 12 },
  hungerValue: { color: text, fontSize: 12, fontWeight: '600' },
  track: { width: '100%', height: 8, borderRadius: 99, backgroundColor: '#e9ecdf', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 99 },
  primary: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, borderRadius: 17, backgroundColor: activeBg, marginTop: 4 },
  primaryText: { color: activeText, fontSize: 14, fontWeight: '700' },
  primaryDisabled: { backgroundColor: panelSoft, borderWidth: 1, borderColor: line },
  disabledText: { color: muted },
  helper: { color: muted, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingHorizontal: 4 },
  earned: { color: muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  lifeHint: { paddingHorizontal: 11, paddingVertical: 9, borderRadius: 14, backgroundColor: '#f4f5eb', gap: 4 },
  lifeHintText: { color: '#4e5a43', fontSize: 11, lineHeight: 16 },
  deadline: { color: '#70583b', fontSize: 11, lineHeight: 16, fontWeight: '600' },
  roomDecoration: { position: 'absolute', left: 16, bottom: 38, alignItems: 'center', justifyContent: 'center' },
  pillow: { width: 54, height: 34, borderRadius: 15, backgroundColor: '#c9d4b5', borderWidth: 1, borderColor: '#aebc95', transform: [{ rotate: '-8deg' }], shadowColor: '#38442d', shadowOpacity: .12, shadowRadius: 5, shadowOffset: { width: 0, height: 3 } },
  pillowFold: { width: 1, height: 20, backgroundColor: '#aebc95', opacity: .7 },
  plant: { width: 46, height: 62, gap: -1 },
  pot: { width: 28, height: 20, backgroundColor: '#c79b73', borderBottomLeftRadius: 8, borderBottomRightRadius: 8, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  lantern: { width: 42, height: 62, gap: 0 },
  lanternHandle: { width: 12, height: 7, borderWidth: 2, borderBottomWidth: 0, borderColor: '#9a7446', borderTopLeftRadius: 7, borderTopRightRadius: 7 },
  lanternBody: { width: 32, height: 38, borderRadius: 9, borderWidth: 2, borderColor: '#b39462', backgroundColor: '#f1e3b5', alignItems: 'center', justifyContent: 'center' },
  lanternBase: { width: 38, height: 5, borderRadius: 4, backgroundColor: '#9a7446' },
  pressed: { opacity: .84, transform: [{ scale: .985 }] },
  collection: { borderRadius: 24, backgroundColor: panel, borderWidth: 1, borderColor: line, padding: 18, gap: 8 },
  collectionToggle: {minHeight:52,borderRadius:20,backgroundColor:panel,paddingHorizontal:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
  nameEditor: {flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:6},
  nameInput: {minHeight:44,minWidth:130,flexGrow:1,borderRadius:14,borderWidth:1,borderColor:line,backgroundColor:panel,paddingHorizontal:12,color:text,fontSize:14},
  nameButton: {minHeight:44,justifyContent:'center',paddingHorizontal:12},
  nameButtonText: {color:accent,fontSize:12,fontWeight:'600'},
  collectionHeader: { minHeight: 42, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  sectionTitle: { color: text, fontSize: 17, fontWeight: '700' },
  sectionCopy: { color: muted, fontSize: 12, lineHeight: 18 },
  tabs: { flexDirection: 'row', gap: 4, padding: 3, borderRadius: 15, backgroundColor: panelSoft, borderWidth: 1, borderColor: line },
  tab: { minHeight: 36, paddingHorizontal: 10, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 5 },
  tabSelected: { backgroundColor: activeBg },
  tabText: { color: muted, fontSize: 12, fontWeight: '600' },
  tabTextSelected: { color: activeText },
  emptyCollection: { minHeight: 92, borderRadius: 18, borderWidth: 1, borderColor: line, backgroundColor: panelSoft, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  emptyIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: accentSoft, alignItems: 'center', justifyContent: 'center' },
  emptyWords: { flex: 1, gap: 3 },
  emptyTitle: { color: text, fontSize: 14, fontWeight: '700' },
  emptyCopy: { color: muted, fontSize: 12, lineHeight: 18 },
  items: { gap: 10, paddingVertical: 4, paddingRight: 2 },
  unlock: { width: 150, minHeight: 142, padding: 12, borderRadius: 18, borderWidth: 1, borderColor: line, backgroundColor: panelSoft, gap: 6 },
  unlockSelected: { borderColor: '#a3b467', backgroundColor: '#f4f6e9' },
  unlockIcon: { width: 36, height: 36, borderRadius: 13, backgroundColor: '#e7edda', alignItems: 'center', justifyContent: 'center' },
  unlockIconSelected: { backgroundColor: activeBg },
  unlockName: { color: text, fontSize: 13, fontWeight: '700' },
  unlockCopy: { color: muted, fontSize: 11, lineHeight: 15 },
  unlockAction: { color: accent, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 'auto' },
});
