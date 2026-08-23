import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Send } from 'lucide-react-native';
import type { ChatMessage } from '../types';
import { SectionTitle } from '../components';
import { accent, faint } from '../theme';
import { styles } from '../styles';

export function KodaScreen({ chat, isDesktop = false, onSend }: { chat: ChatMessage[]; isDesktop?: boolean; onSend: (text: string) => void }) {
  const [value, setValue] = useState('');

  function submit() {
    if (!value.trim()) return;
    onSend(value);
    setValue('');
  }

  const chatPane = (
    <View style={[styles.kodaChatPane, isDesktop && styles.kodaChatPaneDesktop]}>
      <ScrollView contentContainerStyle={[styles.chatList, isDesktop && styles.chatListDesktop]} showsVerticalScrollIndicator={false}>
        {chat.map((message) => (
          <View key={message.id} style={[styles.chatBubble, isDesktop && styles.chatBubbleDesktop, message.role === 'user' && styles.chatBubbleUser]}>
            <Text style={styles.chatText}>{message.text}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.chatInputRow}>
        <TextInput
          onChangeText={setValue}
          onSubmitEditing={submit}
          placeholder="Напиши запрос..."
          placeholderTextColor={faint}
          style={styles.chatInput}
          value={value}
        />
        <Pressable onPress={submit} style={styles.sendButton}>
          <Send color={accent} size={17} />
        </Pressable>
      </View>
    </View>
  );

  if (!isDesktop) {
    return (
      <View style={styles.kodaScreen}>
        <SectionTitle title="Помощник" subtitle="Твой AI-ассистент" />
        {chatPane}
      </View>
    );
  }

  return (
    <View style={styles.assistantDesktopSurface} testID="desktop-main-column">
      <View style={styles.kodaDesktopHeader}>
        <SectionTitle title="Помощник" subtitle="Диалог с KODA" />
      </View>
      {chatPane}
    </View>
  );
}
