import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Send } from 'lucide-react-native';
import type { ChatMessage } from '../types';
import { SectionTitle } from '../components';
import { BentoPage, bentoWidths } from '../components/Bento';
import { accent, faint, ink, line, muted, panel, panelSoft, text as textColor } from '../theme';
import { styles } from '../styles';

type KodaProvider = 'gemini' | 'openrouter' | 'yandex' | null;

const providerNames: Record<Exclude<KodaProvider, null>, string> = {
  gemini: 'Gemini',
  openrouter: 'OpenRouter',
  yandex: 'Яндекс',
};

type KodaScreenProps = {
  chat: ChatMessage[];
  isDesktop?: boolean;
  isSending?: boolean;
  error?: string | null;
  provider?: KodaProvider;
  onSend: (text: string) => boolean | void;
  onRetry?: () => void;
  retryLabel?:string;
  inputDisabled?:boolean;
  historyStatus?:string;
  syncError?:string|null;
  onSyncRetry?:()=>void;
  initialDraft?: string;
  onDraftConsumed?: () => void;
  composerValue?: string;
  onComposerChange?: (value: string) => void;
};

export function KodaScreen({
  chat,
  isDesktop = false,
  isSending = false,
  error = null,
  provider = null,
  onSend,
  onRetry,
  retryLabel='Повторить',
  inputDisabled=false,
  historyStatus,
  syncError=null,
  onSyncRetry,
  initialDraft,
  onDraftConsumed,
  composerValue,
  onComposerChange,
}: KodaScreenProps) {
  const [localValue, setLocalValue] = useState('');
  const value = composerValue ?? localValue;
  function setValue(next: string | ((current: string) => string)) {
    const resolved = typeof next === 'function' ? next(value) : next;
    if (composerValue !== undefined && onComposerChange) onComposerChange(resolved);
    else setLocalValue(resolved);
  }
  const requestStarted = useRef(false);
  const scrollView = useRef<ScrollView>(null);
  const composer = useRef<TextInput>(null);
  const nearBottom = useRef(true);
  const lastDraft = useRef('');
  const showWelcome = chat.length === 0 || chat.every(message => message.id === 'koda-1');

  useEffect(() => {
    requestStarted.current = isSending;
  }, [isSending]);

  useEffect(() => {
    if (!initialDraft) {
      lastDraft.current = '';
      return;
    }
    if (lastDraft.current === initialDraft) return;
    lastDraft.current = initialDraft;
    setValue((current) => current.trim() ? `${current.trimEnd()}\n\n${initialDraft}` : initialDraft);
    onDraftConsumed?.();
  }, [initialDraft, onDraftConsumed]);

  function submit() {
    const message = value.trim();
    if (!message || inputDisabled || isSending || requestStarted.current) return;

    requestStarted.current = true;
    if (onSend(message) === false) {
      requestStarted.current = false;
      return;
    }
    setValue('');
  }

  const chatPane = (
    <View style={[styles.kodaChatPane, isDesktop && styles.kodaChatPaneDesktop,showWelcome&&local.welcomePane]}>
      {showWelcome ? (
        <View style={[local.quickPromptBar, isDesktop && local.quickPromptBarDesktop]}>
          <Text style={local.quickPromptTitle}>С чего начнём?</Text><Text style={local.welcomeCopy}>Расскажи, что хочется сделать и сколько сейчас сил. Вместе найдём посильный шаг.</Text>
          <View style={[local.starters,isDesktop&&{flexDirection:'row'}]}>
            {[
              'Помоги выбрать один посильный шаг на сегодня',
              'Разложи сложную задачу на короткие действия',
              'Помоги понять, что сейчас мешает начать',
            ].map((prompt) => (
              <Pressable key={prompt} accessibilityRole="button" onPress={() => {setValue((current) => current.trim() ? current : prompt);composer.current?.focus();}} style={[local.starterButton,isDesktop&&{flex:1}]}>
                <Text numberOfLines={2} style={local.starterText}>{prompt}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      {(!showWelcome || !!error || isSending) && <ScrollView
        ref={scrollView}
        contentContainerStyle={[styles.chatList, isDesktop && styles.chatListDesktop]}
        onContentSizeChange={() => {
          if (nearBottom.current) scrollView.current?.scrollToEnd({ animated: true });
        }}
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          nearBottom.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 80;
        }}
        scrollEventThrottle={100}
        showsVerticalScrollIndicator={false}
      >
        {(showWelcome ? [] : chat).map((message) => (
          <View key={message.id} style={[styles.chatBubble, isDesktop && styles.chatBubbleDesktop, message.role === 'user' && styles.chatBubbleUser]}>
            <Text style={styles.chatText}>{message.text}</Text>
          </View>
        ))}
        {isSending && (
          <View accessibilityLiveRegion="polite" style={{ alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 9, paddingVertical: 8 }}>
            <ActivityIndicator color={accent} size="small" />
            <Text style={{ color: muted, fontSize: 13 }}>Готовлю ответ…</Text>
          </View>
        )}
        {!!error && !isSending && (
          <View style={{ alignSelf: 'flex-start', backgroundColor: panelSoft, borderColor: line, borderRadius: 12, borderWidth: 1, gap: 8, maxWidth: 720, padding: 12 }}>
            <Text accessibilityLiveRegion="polite" style={{ color: textColor, fontSize: 13, lineHeight: 19 }}>{error}</Text>
            {onRetry && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={retryLabel === 'Повторить' ? 'Повторить последний запрос помощнику' : retryLabel}
                onPress={onRetry}
                style={{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}
              >
                <Text style={{ color: accent, fontSize: 13, fontWeight: '600' }}>{retryLabel}</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>}
      {!!syncError && <View style={{paddingHorizontal:24,paddingVertical:8}}><Text accessibilityLiveRegion="polite" style={{color:muted,fontSize:12}}>{syncError}</Text>{onSyncRetry&&<Pressable accessibilityRole="button" accessibilityLabel="Повторить синхронизацию истории" onPress={onSyncRetry} style={{minHeight:36,justifyContent:'center'}}><Text style={{color:accent,fontSize:12}}>Повторить синхронизацию</Text></Pressable>}</View>}
      {!!historyStatus && <Text accessibilityLiveRegion="polite" style={{color:muted,fontSize:12,paddingHorizontal:showWelcome?0:24,paddingBottom:8}}>{historyStatus}</Text>}
      <View style={[styles.chatInputRow,showWelcome&&{marginHorizontal:0,marginBottom:0}]}>
        <TextInput
          ref={composer}
          accessibilityLabel="Сообщение помощнику"
          editable={!inputDisabled}
          maxLength={2000}
          onChangeText={setValue}
          multiline
          placeholder="Напиши запрос..."
          placeholderTextColor={faint}
          returnKeyType="default"
          style={styles.chatInput}
          value={value}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isSending ? 'Ответ помощника готовится' : 'Отправить сообщение помощнику'}
          accessibilityState={{ disabled: inputDisabled || isSending || !value.trim() }}
          disabled={inputDisabled || isSending || !value.trim()}
          onPress={submit}
          style={[styles.sendButton, { minHeight: 44, minWidth: 44, opacity: inputDisabled || isSending || !value.trim() ? 0.55 : 1 }]}
        >
          <Send color={accent} size={17} />
        </Pressable>
      </View>
    </View>
  );

  const subtitle = provider ? `Диалог с KODA · ${providerNames[provider]}` : 'Диалог с KODA';

  if (!isDesktop) {
    return (
      <View style={styles.kodaScreen}>
        <BentoPage maxWidth={bentoWidths.assistant} scroll={showWelcome} contentStyle={local.assistantPageContent}>
          <SectionTitle title="Помощник" subtitle={subtitle} />
          {chatPane}
        </BentoPage>
      </View>
    );
  }

  return (
    <BentoPage maxWidth={bentoWidths.assistant} scroll={showWelcome} style={{ flex: 1, minHeight: 0 }} contentStyle={local.assistantPageContent} testID="desktop-main-column">
      <View style={styles.kodaDesktopHeader}>
        <SectionTitle title="Помощник" subtitle={subtitle} />
      </View>
      {chatPane}
    </BentoPage>
  );
}

const local = StyleSheet.create({
  assistantPageContent: { gap: 12 },
  quickPromptBar: { gap: 7, minWidth: 0, paddingTop: 2 },
  quickPromptBarDesktop: { alignSelf: 'center', maxWidth: 760, width: '100%' },
  welcomePane: {flexGrow:0,flexShrink:0,flexBasis:'auto',minHeight:0,backgroundColor:panel,borderRadius:28,padding:20,gap:16},
  welcomeCopy: {color:muted,fontSize:14,lineHeight:21,maxWidth:540},
  quickPromptTitle: { color: textColor, fontSize:22,fontWeight:'500', lineHeight:28 },
  starters: { alignItems: 'stretch', flexDirection: 'column', gap: 8, paddingVertical:8 },
  starterButton: { backgroundColor: panelSoft, borderColor: line, borderRadius: 14, borderWidth: 1, justifyContent: 'center', minHeight: 52, paddingHorizontal: 12, paddingVertical: 10 },
  starterText: { color: textColor, fontSize: 13, lineHeight: 18 },
});
