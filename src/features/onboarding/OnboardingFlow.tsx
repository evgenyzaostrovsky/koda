import { StatusBar } from 'expo-status-bar';
import { ArrowRight, Check, Moon, Sparkles, Sun } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { LifeAreaId } from '../../onboardingV2/futureSelfData';
import { useFutureSelfOnboarding } from '../../onboardingV2/useFutureSelfOnboarding';

type OnboardingFlowProps = {
  onComplete?: () => void;
};

type ThemeMode = 'dark' | 'light';
type Archetype = 'player' | 'analyst' | 'empath';
type Scores = Record<Archetype, number>;
type KodaStyles = ReturnType<typeof makeStyles>;

type AnswerOption = {
  label: string;
  scores: Partial<Scores>;
  insight: string;
};

type ArchetypeQuestion = {
  id: string;
  step: string;
  question: string;
  reaction: string;
  systemPurpose: string;
  options: [AnswerOption, AnswerOption, AnswerOption];
};

type DialogueItem = {
  id: string;
  role: 'ai' | 'user' | 'result';
  text: string;
};

type SandTarget = Archetype;

const emptyScores: Scores = {
  player: 0,
  analyst: 0,
  empath: 0,
};

const archetypeNames: Record<Archetype, string> = {
  player: 'Игрок',
  analyst: 'Аналитик',
  empath: 'Эмпат',
};

const archetypeDescriptions: Record<Archetype, string> = {
  player: 'Сейчас тебя сильнее всего включает видимый прогресс: маленькие победы, движение и ощущение роста.',
  analyst: 'Сейчас тебе важнее понимать причины, видеть структуру и не двигаться вслепую.',
  empath: 'Сейчас тебе нужна опора: спокойствие, бережный темп и ощущение, что путь не давит.',
};

const archetypeProfiles: Record<
  Archetype,
  {
    strengths: string;
    risks: string;
    motivates: string;
    blocks: string;
  }
> = {
  player: {
    strengths: 'Быстро действует, любит вызов, держит высокую энергию.',
    risks: 'Скучает в рутине, может торопиться и бросать без видимого движения.',
    motivates: 'Соревнование с собой и видимая победа.',
    blocks: 'Отсутствие вызова и понятной цели.',
  },
  analyst: {
    strengths: 'Видит систему, глубоко думает, стратегично выбирает путь.',
    risks: 'Может откладывать старт и перегружаться анализом.',
    motivates: 'Ясность, данные и понимание причин.',
    blocks: 'Неопределенность и хаотичный контекст.',
  },
  empath: {
    strengths: 'Чувствует людей, строит сильные связи, находит глубокий смысл.',
    risks: 'Может принимать чужое на себя, ему сложно говорить "нет".',
    motivates: 'Теплые связи и ощущение значимости для других.',
    blocks: 'Конфликты и эмоциональная изоляция.',
  },
};

const focusOptions: Array<{ label: string; areaId: LifeAreaId }> = [
  { label: 'Финансы', areaId: 'money' },
  { label: 'Здоровье', areaId: 'health' },
  { label: 'Дисциплина', areaId: 'organization' },
  { label: 'Карьера', areaId: 'career' },
  { label: 'Отношения', areaId: 'relationships' },
  { label: 'Эмоциональная устойчивость', areaId: 'emotions' },
];

const archetypeQuestions: ArchetypeQuestion[] = [
  {
    id: 'entry',
    step: 'Легкий вход',
    question: 'Когда жизнь становится сложнее, что обычно помогает тебе двигаться дальше?',
    reaction: 'Интересно. Это многое говорит о том, откуда у тебя появляется движение.',
    systemPurpose: 'Определяем первый источник мотивации: прогресс, понимание или состояние.',
    options: [
      { label: 'Ощущение прогресса', scores: { player: 2 }, insight: 'progress' },
      { label: 'Понимание происходящего', scores: { analyst: 2 }, insight: 'clarity' },
      { label: 'Поддержка и спокойствие', scores: { empath: 2 }, insight: 'support' },
    ],
  },
  {
    id: 'decision',
    step: 'Способ входа',
    question: 'Когда нужно что-то менять, с чего тебе проще начать?',
    reaction: 'Любопытно. Похоже, для тебя важен не только результат, но и способ входа в движение.',
    systemPurpose: 'Понимаем, какой тип первого шага будет легче принять.',
    options: [
      { label: 'Сделать маленькое действие', scores: { player: 2 }, insight: 'action' },
      { label: 'Разобраться в причине', scores: { analyst: 2 }, insight: 'reason' },
      { label: 'Сначала прийти в себя', scores: { empath: 2 }, insight: 'stabilize' },
    ],
  },
  {
    id: 'friction',
    step: 'Трудности',
    question: 'Что чаще всего происходит, когда что-то идет не по плану?',
    reaction: 'Замечаю закономерность. Кажется, дело не только в силе воли.',
    systemPurpose: 'Находим вероятный сценарий отката.',
    options: [
      { label: 'Я теряю темп', scores: { player: 2 }, insight: 'lost tempo' },
      { label: 'Ищу, где система дала сбой', scores: { analyst: 2 }, insight: 'debug' },
      { label: 'Меня выбивает эмоционально', scores: { empath: 2 }, insight: 'emotional hit' },
    ],
  },
  {
    id: 'fuel',
    step: 'Мотивация',
    question: 'Что сильнее всего дает тебе ощущение: “я снова в игре”?',
    reaction: 'Это многое объясняет. Такой формат мотивации важно учитывать.',
    systemPurpose: 'Выбираем будущий motivational UI: XP, структура или поддержка.',
    options: [
      { label: 'Галочка, уровень, серия', scores: { player: 2 }, insight: 'xp' },
      { label: 'Понять, почему я буксовал', scores: { analyst: 2 }, insight: 'pattern' },
      { label: 'Спокойствие и внутренняя опора', scores: { empath: 2 }, insight: 'inner support' },
    ],
  },
  {
    id: 'conflict',
    step: 'Внутренний узел',
    question: 'Что чаще всего мешает тебе двигаться так, как ты хочешь?',
    reaction: 'Понял. Здесь может быть главный узел, который раньше тормозил движение.',
    systemPurpose: 'Определяем главный паттерн самосаботажа.',
    options: [
      { label: 'Быстро загораюсь и быстро теряю интерес', scores: { player: 2 }, insight: 'interest drop' },
      { label: 'Слишком долго думаю и усложняю старт', scores: { analyst: 2 }, insight: 'overthinking' },
      { label: 'Становится тяжело внутри, и я избегаю', scores: { empath: 2 }, insight: 'avoidance' },
    ],
  },
  {
    id: 'domain',
    step: 'Жизненная сфера',
    question: 'Если представить, что через год стало легче жить, где это ощущается сильнее всего?',
    reaction: 'Вижу направление. Это больше похоже на жизненную область, чем на одну задачу.',
    systemPurpose: 'Понимаем, где у пользователя главный эмоциональный вес.',
    options: [
      { label: 'В деньгах, работе или росте', scores: { player: 1, analyst: 1 }, insight: 'growth area' },
      { label: 'В порядке, фокусе и управлении жизнью', scores: { analyst: 2 }, insight: 'order' },
      { label: 'В спокойствии, отношениях и состоянии', scores: { empath: 2 }, insight: 'state' },
    ],
  },
  {
    id: 'barrier',
    step: 'Барьер',
    question: 'Что делает эту сферу особенно тяжелой?',
    reaction: 'Хорошо. Теперь становится понятнее, почему обычные планы могли не сработать.',
    systemPurpose: 'Понимаем, какую защиту от отката нужно встроить.',
    options: [
      { label: 'Нет быстрых побед, и все тухнет', scores: { player: 2 }, insight: 'no wins' },
      { label: 'Слишком много неизвестности', scores: { analyst: 2 }, insight: 'uncertainty' },
      { label: 'Она давит еще до действий', scores: { empath: 2 }, insight: 'pressure' },
    ],
  },
  {
    id: 'future',
    step: 'Будущая версия',
    question: 'Представь себя через год. Что в тебе заметили бы другие?',
    reaction: 'Вот здесь уже появляется будущая версия тебя.',
    systemPurpose: 'Формируем первый контур будущей идентичности.',
    options: [
      { label: 'Я стал собраннее и двигаюсь вперед', scores: { player: 2 }, insight: 'moving forward' },
      { label: 'Я яснее понимаю себя и решения', scores: { analyst: 2 }, insight: 'clear decisions' },
      { label: 'Я спокойнее, увереннее и мягче к себе', scores: { empath: 2 }, insight: 'calm self' },
    ],
  },
  {
    id: 'cost',
    step: 'Цена старого пути',
    question: 'Если ничего не менять, что больше всего не хочется тащить дальше?',
    reaction: 'Это важный сигнал. Не страх, а точка, где старая система перестала помогать.',
    systemPurpose: 'Понимаем эмоциональную ставку изменений.',
    options: [
      { label: 'Ощущение, что я стою на месте', scores: { player: 2 }, insight: 'standing still' },
      { label: 'Хаос и непонимание, что делать', scores: { analyst: 2 }, insight: 'chaos' },
      { label: 'Усталость, тревогу или напряжение', scores: { empath: 2 }, insight: 'tension' },
    ],
  },
  {
    id: 'first-step',
    step: 'Первый шаг',
    question: 'Какой первый шаг тебе было бы легче принять уже сейчас?',
    reaction: 'Отлично. Теперь можно собрать первый путь без перегруза.',
    systemPurpose: 'Выбираем формат первого квеста.',
    options: [
      { label: 'Маленький квест на 15-30 минут', scores: { player: 2 }, insight: 'micro quest' },
      { label: 'Короткий разбор и понятный план', scores: { analyst: 2 }, insight: 'short plan' },
      { label: 'Мягкий шаг без давления', scores: { empath: 2 }, insight: 'soft step' },
    ],
  },
];

const onboardingQuestions: ArchetypeQuestion[] = [
  {
    id: 'intro-drive',
    step: 'Знакомство',
    question: 'Привет. Я KODA. Я помогу тебе лучше понять себя. Расскажи - что чаще всего тебя двигает вперед?',
    reaction: 'Интересно.',
    systemPurpose: 'Проверяем, откуда пользователь чаще берет энергию: победа, понимание или связь.',
    options: [
      { label: 'Желание выиграть, обойти себя вчерашнего', scores: { player: 2 }, insight: 'drive: victory' },
      { label: 'Желание разобраться, как все устроено', scores: { analyst: 2 }, insight: 'drive: clarity' },
      { label: 'Желание чувствовать связь с людьми', scores: { empath: 2 }, insight: 'drive: connection' },
    ],
  },
  {
    id: 'first-minutes',
    step: 'Контекст',
    question: 'Когда ты сталкиваешься со сложной задачей - что ты делаешь в первые минуты?',
    reaction: 'Замечаю закономерность.',
    systemPurpose: 'Понимаем первичную стратегию входа в сложность.',
    options: [
      { label: 'Беру и пробую - разберусь по ходу', scores: { player: 2 }, insight: 'strategy: try first' },
      { label: 'Раскладываю на части, ищу логику', scores: { analyst: 2 }, insight: 'strategy: structure' },
      { label: 'Думаю, кто уже сталкивался, с кем обсудить', scores: { empath: 2 }, insight: 'strategy: discuss' },
    ],
  },
  {
    id: 'energy',
    step: 'Энергия',
    question: 'Что дает тебе больше всего энергии в конце дня?',
    reaction: 'Это многое объясняет.',
    systemPurpose: 'Выявляем главный источник подкрепления.',
    options: [
      { label: 'Ощущение, что я сегодня победил', scores: { player: 2 }, insight: 'energy: win' },
      { label: 'Ясность - я понял что-то новое', scores: { analyst: 2 }, insight: 'energy: insight' },
      { label: 'Теплый разговор или помощь кому-то', scores: { empath: 2 }, insight: 'energy: warmth' },
    ],
  },
  {
    id: 'obstacle',
    step: 'Препятствия',
    question: 'А что чаще всего тебя тормозит?',
    reaction: 'Картина становится яснее.',
    systemPurpose: 'Определяем тип барьера, который будет ломать путь.',
    options: [
      { label: 'Скука, отсутствие вызова', scores: { player: 2 }, insight: 'blocker: boredom' },
      { label: 'Когда нет данных и непонятно, куда идти', scores: { analyst: 2 }, insight: 'blocker: uncertainty' },
      { label: 'Напряжение в отношениях или одиночество', scores: { empath: 2 }, insight: 'blocker: isolation' },
    ],
  },
  {
    id: 'future-feeling',
    step: 'Будущее',
    question: 'Если бы ты увидел себя через год - что бы тебе хотелось почувствовать в первую очередь?',
    reaction: 'Профиль обновлен.',
    systemPurpose: 'Формируем первое ядро будущей версии.',
    options: [
      { label: 'Что я стал сильнее и быстрее', scores: { player: 2 }, insight: 'future: stronger' },
      { label: 'Что я наконец понял, кто я и куда иду', scores: { analyst: 2 }, insight: 'future: direction' },
      { label: 'Что вокруг меня - близкие и настоящие люди', scores: { empath: 2 }, insight: 'future: closeness' },
    ],
  },
];

const palettes = {
  dark: {
    app: '#050505',
    text: '#FFFFFF',
    muted: '#B7B7B7',
    faint: '#7D7D7D',
    line: '#303030',
    panel: '#171717',
    aiBubble: '#252525',
    userBubble: '#F1F1F1',
    userText: '#050505',
    accent: '#F1F1F1',
    accentText: '#050505',
    active: '#F1F1F1',
    orange: '#FF5A0A',
    progressTrack: '#1F1F1F',
    progressFill: '#D8D8D8',
    progressActive: '#FFFFFF',
    progressSpark: '#FFFFFF',
    gold: '#FFDDA1',
    goldCore: '#FFF4DA',
    goldGlow: 'rgba(255, 221, 161, 0.42)',
    core: '#F7F7F7',
    innerGlow: 'rgba(255, 255, 255, 0.16)',
    orbitLine: 'rgba(255, 255, 255, 0.34)',
    orbitDot: 'rgba(255, 255, 255, 0.68)',
    constellationLine: 'rgba(255, 255, 255, 0.18)',
    constellationNode: 'rgba(255, 255, 255, 0.05)',
    constellationGlow: 'rgba(255, 255, 255, 0.28)',
    bubbleLine: 'rgba(255, 255, 255, 0.14)',
  },
  light: {
    app: '#FFFFFF',
    text: '#090909',
    muted: '#5F6064',
    faint: '#A0A0A0',
    line: '#E5E2DF',
    panel: '#F7F4F1',
    aiBubble: '#F4F2F0',
    userBubble: '#FF5A0A',
    userText: '#FFFFFF',
    accent: '#FF5A0A',
    accentText: '#FFFFFF',
    active: '#FF5A0A',
    orange: '#FF5A0A',
    progressTrack: '#E8E2DD',
    progressFill: '#111111',
    progressActive: '#FF5A0A',
    progressSpark: '#FF5A0A',
    gold: '#FFB35A',
    goldCore: '#FFF2D6',
    goldGlow: 'rgba(255, 179, 90, 0.34)',
    core: '#111111',
    innerGlow: 'rgba(9, 9, 9, 0.12)',
    orbitLine: 'rgba(9, 9, 9, 0.25)',
    orbitDot: 'rgba(9, 9, 9, 0.58)',
    constellationLine: 'rgba(9, 9, 9, 0.16)',
    constellationNode: 'rgba(9, 9, 9, 0.04)',
    constellationGlow: 'rgba(255, 90, 10, 0.26)',
    bubbleLine: 'rgba(9, 9, 9, 0.12)',
  },
};

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const koda = useFutureSelfOnboarding();
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');
  const [introDone, setIntroDone] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<AnswerOption | null>(null);
  const [showReveal, setShowReveal] = useState(false);
  const [scores, setScores] = useState<Scores>(emptyScores);
  const [visibleScores, setVisibleScores] = useState<Scores>(emptyScores);
  const [answerInsights, setAnswerInsights] = useState<string[]>([]);
  const [dialogueItems, setDialogueItems] = useState<DialogueItem[]>([
    {
      id: 'ai-0',
      role: 'ai',
      text: onboardingQuestions[0].question,
    },
  ]);
  const [sandText, setSandText] = useState('');
  const [sandTarget, setSandTarget] = useState<SandTarget>('player');
  const [activeProgressTarget, setActiveProgressTarget] = useState<SandTarget | null>(null);

  const palette = palettes[themeMode];
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const activeQuestion = onboardingQuestions[questionIndex];
  const activeArchetype = getTopArchetype(scores);
  const activeVisualTarget = sandText ? sandTarget : activeProgressTarget;
  const isLight = themeMode === 'light';

  function toggleTheme() {
    setThemeMode((current) => (current === 'dark' ? 'light' : 'dark'));
  }

  function selectAnswer(option: AnswerOption) {
    if (selectedOption) {
      return;
    }

    setSelectedOption(option);
    setScores((current) => addScores(current, option.scores));
    setAnswerInsights((current) => [...current, option.insight]);
    setSandText(option.label);
    const target = getDominantScore(option.scores);
    setSandTarget(target);
    setDialogueItems((current) => [
      ...current,
      {
        id: `user-${questionIndex}`,
        role: 'user',
        text: option.label,
      },
    ]);

    setTimeout(() => {
      setSandText('');
      setActiveProgressTarget(target);
      setVisibleScores((current) => addScores(current, option.scores));
    }, 1680);

    setTimeout(() => {
      setActiveProgressTarget(null);

      if (questionIndex >= onboardingQuestions.length - 1) {
        setShowReveal(true);
        setDialogueItems((current) => [
          ...current,
          {
            id: 'result',
            role: 'result',
            text: 'Спасибо. Я собрал достаточно, чтобы показать первый набросок твоего профиля.',
          },
        ]);
        return;
      }

      const nextIndex = questionIndex + 1;
      setQuestionIndex(nextIndex);
      setSelectedOption(null);
      setDialogueItems((current) => [
        ...current,
        {
          id: `ai-${nextIndex}`,
          role: 'ai',
          text: onboardingQuestions[nextIndex].question,
        },
      ]);
    }, 3250);
  }

  function continueArchetypeFlow() {
    finishArchetypeFlow();
  }

  function finishArchetypeFlow() {
    const top = getTopArchetype(scores);
    koda.setTransformation(archetypeNames[top]);
    koda.setFutureChanges(buildFutureSignal(answerInsights, top));
    koda.setStep('areas');
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style={isLight ? 'dark' : 'light'} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.stage}>
        <View style={styles.shell}>
          {!(koda.step === 'welcome' && introDone) ? (
            <ThemeToggle isLight={isLight} styles={styles} onPress={toggleTheme} />
          ) : null}

          {koda.step === 'welcome' && !introDone ? (
            <IntroScreen styles={styles} onBegin={() => setIntroDone(true)} onSkip={() => setIntroDone(true)} />
          ) : null}

          {koda.step === 'welcome' && introDone ? (
            <ArchetypeQuestionScreen
              archetype={activeArchetype}
              dialogueItems={dialogueItems}
              question={activeQuestion}
              questionIndex={questionIndex}
              scores={visibleScores}
              selectedOption={selectedOption}
              showReveal={showReveal}
              activeProgressTarget={activeVisualTarget}
              sandText={sandText}
              sandTarget={sandTarget}
              styles={styles}
              themeMode={themeMode}
              onContinue={continueArchetypeFlow}
              onSelect={selectAnswer}
              onToggleTheme={toggleTheme}
            />
          ) : null}

          {koda.step === 'areas' ? <FocusScreen koda={koda} styles={styles} /> : null}

          {koda.step === 'areaDetails' && koda.currentArea ? <AreaDetailsScreen koda={koda} styles={styles} /> : null}

          {koda.step === 'reflection' ? <ReflectionScreen koda={koda} styles={styles} /> : null}

          {koda.step === 'futureChanges' ? <FutureChangesScreen koda={koda} styles={styles} /> : null}

          {koda.step === 'transformation' ? <TransformationScreen koda={koda} styles={styles} /> : null}

          {koda.step === 'futureSelf' && koda.futureSelf ? <FutureSelfScreen koda={koda} styles={styles} /> : null}

          {koda.step === 'confirm' && koda.futureSelf ? <ConfirmScreen koda={koda} styles={styles} /> : null}

          {koda.step === 'ready' ? <ReadyScreen styles={styles} onComplete={onComplete || koda.reset} /> : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ThemeToggle({ isLight, styles, onPress }: { isLight: boolean; styles: KodaStyles; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.themeToggle}>
      {isLight ? <Moon size={18} color="#090909" strokeWidth={2.2} /> : <Sun size={18} color="#FFFFFF" strokeWidth={2.2} />}
    </Pressable>
  );
}

function IntroScreen({ styles, onBegin, onSkip }: { styles: KodaStyles; onBegin: () => void; onSkip: () => void }) {
  return (
    <View style={styles.centerScreen}>
      <View style={styles.appIcon}>
        <Sparkles size={28} color="#050505" strokeWidth={2.1} />
      </View>
      <Text style={styles.introTitle}>Давай я узнаю тебя получше.</Text>
      <Text style={styles.introCopy}>
        Короткая беседа. Без тестов и оценок. Я постепенно собираю твой профиль и помогу увидеть будущую версию тебя.
      </Text>
      <Pressable onPress={onBegin} style={styles.primaryPill}>
        <Text style={styles.primaryPillText}>Начать</Text>
        <ArrowRight size={18} color={styles.tokens.accentText} strokeWidth={2.2} />
      </Pressable>
      <Pressable onPress={onSkip} style={styles.textButton}>
        <Text style={styles.textButtonText}>Пропустить интро</Text>
      </Pressable>
    </View>
  );
}

function ArchetypeQuestionScreen({
  archetype,
  dialogueItems,
  question,
  questionIndex,
  scores,
  selectedOption,
  showReveal,
  activeProgressTarget,
  sandText,
  sandTarget,
  styles,
  themeMode,
  onContinue,
  onSelect,
  onToggleTheme,
}: {
  archetype: Archetype;
  dialogueItems: DialogueItem[];
  question: ArchetypeQuestion;
  questionIndex: number;
  scores: Scores;
  selectedOption: AnswerOption | null;
  showReveal: boolean;
  activeProgressTarget: SandTarget | null;
  sandText: string;
  sandTarget: SandTarget;
  styles: KodaStyles;
  themeMode: ThemeMode;
  onContinue: () => void;
  onSelect: (option: AnswerOption) => void;
  onToggleTheme: () => void;
}) {
  const isWaiting = Boolean(selectedOption) && !showReveal;
  const showReaction = false;

  return (
    <View style={styles.screen}>
      <ProgressDots activeIndex={Math.min(3, Math.floor(questionIndex / 3))} styles={styles} />
      <Text style={styles.stepLabel}>
        {question.step.toUpperCase()} · {questionIndex + 1} / {onboardingQuestions.length}
      </Text>
      <Text style={styles.screenTitle}>Короткая беседа</Text>

      <ScrollView style={styles.chatScroll} contentContainerStyle={styles.chatContent} showsVerticalScrollIndicator={false}>
        {dialogueItems.map((item) => {
          if (item.role === 'user') {
            return (
              <View key={item.id} style={styles.userBubble}>
                <Text style={styles.userBubbleText}>{item.text}</Text>
                <View style={styles.userBubbleTail} />
              </View>
            );
          }

          return (
            <View key={item.id} style={styles.aiBubbleWide}>
              <Text style={styles.aiBubbleText}>{item.text}</Text>
              <View style={styles.aiBubbleTail} />
            </View>
          );
        })}

        {showReveal ? (
          <View style={styles.revealCard}>
            <Text style={styles.revealLabel}>ПЕРВЫЙ ПРОФИЛЬ</Text>
            <Text style={styles.revealTitle}>Я вижу, что сейчас ты чаще действуешь как {archetypeNames[archetype]}.</Text>
            <Text style={styles.revealText}>{archetypeDescriptions[archetype]}</Text>
            <ProfileLine label="Сильные стороны" text={archetypeProfiles[archetype].strengths} styles={styles} />
            <ProfileLine label="Слабые места" text={archetypeProfiles[archetype].risks} styles={styles} />
            <ProfileLine label="Что мотивирует" text={archetypeProfiles[archetype].motivates} styles={styles} />
            <ProfileLine label="Что тормозит" text={archetypeProfiles[archetype].blocks} styles={styles} />
            <Text style={styles.revealHint}>Это не ярлык. Это режим, в котором ты сейчас черпаешь энергию. Со временем он может меняться - и KODA будет это замечать.</Text>
          </View>
        ) : null}
      </ScrollView>

      {!showReveal && !isWaiting ? (
        <View style={[styles.optionDock, dialogueItems.length > 1 && styles.optionDockFollowup]}>
          {question.options.map((option) => (
            <Pressable key={option.label} onPress={() => onSelect(option)} style={styles.answerOption}>
              <Text style={styles.answerOptionText}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {!showReveal && isWaiting ? (
        <View style={styles.inputDock}>
          <Text style={styles.inputPlaceholder}>Напиши свой ответ...</Text>
          <View style={styles.inputSendButton}>
            <Text style={styles.inputSendText}>Отправить</Text>
          </View>
        </View>
      ) : null}

      {showReveal ? (
        <Pressable onPress={onContinue} style={styles.primaryPillBottom}>
          <Text style={styles.primaryPillText}>Продолжить</Text>
          <ArrowRight size={18} color={styles.tokens.accentText} strokeWidth={2.2} />
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <ProgressDots activeIndex={Math.min(3, Math.floor(questionIndex / 3))} styles={styles} />
      <Text style={styles.stepLabel}>
        {question.step.toUpperCase()} · {questionIndex + 1} / {onboardingQuestions.length}
      </Text>
      <Text style={styles.screenTitle}>{showReveal ? 'Я собрал первый набросок твоего профиля' : 'Короткая беседа'}</Text>

      {showReveal ? (
        <View style={styles.revealCard}>
          <Text style={styles.revealLabel}>Спасибо. Я собрал достаточно, чтобы показать первый набросок.</Text>
          <Text style={styles.revealTitle}>Я вижу, что сейчас ты чаще действуешь как {archetypeNames[archetype]}.</Text>
          <Text style={styles.revealText}>{archetypeDescriptions[archetype]}</Text>
          <ProfileLine label="Сильные стороны" text={archetypeProfiles[archetype].strengths} styles={styles} />
          <ProfileLine label="Слабые места" text={archetypeProfiles[archetype].risks} styles={styles} />
          <ProfileLine label="Что мотивирует" text={archetypeProfiles[archetype].motivates} styles={styles} />
          <ProfileLine label="Что тормозит" text={archetypeProfiles[archetype].blocks} styles={styles} />
          <Text style={styles.revealHint}>Это не ярлык. Это режим, в котором ты сейчас черпаешь энергию. Со временем он может меняться - и я буду это замечать.</Text>
        </View>
      ) : (
        <>
          <View style={styles.dialogueBody}>
            <View style={styles.aiBubbleWide}>
              <Text style={styles.aiBubbleText}>{question.question}</Text>
            </View>

            {selectedOption ? (
              <View style={styles.userBubble}>
                <Text style={styles.userBubbleText}>{selectedOption?.label ?? ''}</Text>
              </View>
            ) : null}

            {showReaction ? (
              <View style={styles.aiBubbleWide}>
                <Text style={styles.aiBubbleText}>{question.reaction}</Text>
              </View>
            ) : null}
          </View>

          {!selectedOption ? (
            <View style={styles.optionDock}>
              {question.options.map((option) => (
                <Pressable key={option.label} onPress={() => onSelect(option)} style={styles.answerOption}>
                  <Text style={styles.answerOptionText}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </>
      )}

      {(showReaction || showReveal) ? (
        <Pressable onPress={onContinue} style={styles.primaryPillBottom}>
          <Text style={styles.primaryPillText}>{showReveal ? 'Продолжить' : questionIndex >= onboardingQuestions.length - 1 ? 'Показать профиль' : 'Дальше'}</Text>
          <ArrowRight size={18} color={styles.tokens.accentText} strokeWidth={2.2} />
        </Pressable>
      ) : null}
    </View>
  );
}

function ProfileLine({ label, text, styles }: { label: string; text: string; styles: KodaStyles }) {
  return (
    <View style={styles.profileLine}>
      <Text style={styles.profileLineLabel}>{label}</Text>
      <Text style={styles.profileLineText}>{text}</Text>
    </View>
  );
}

function FocusScreen({ koda, styles }: { koda: ReturnType<typeof useFutureSelfOnboarding>; styles: KodaStyles }) {
  return (
    <View style={styles.screen}>
      <ProgressDots activeIndex={3} styles={styles} />
      <Text style={styles.stepLabel}>ФОКУС</Text>
      <Text style={styles.screenTitle}>Какие сферы жизни сейчас важнее всего?</Text>
      <Text style={styles.screenSubtitle}>Они станут атрибутами, которые ты будешь прокачивать.</Text>

      <View style={styles.focusGrid}>
        {focusOptions.map((option) => {
          const selected = koda.selectedAreas.includes(option.areaId);
          return (
            <Pressable
              key={option.label}
              onPress={() => koda.toggleArea(option.areaId)}
              style={[styles.focusPill, selected && styles.focusPillSelected]}
            >
              <Text style={styles.focusText}>{option.label}</Text>
              <View style={[styles.focusCheck, selected && styles.focusCheckSelected]}>
                {selected ? <Check size={14} color={styles.tokens.accentText} strokeWidth={3} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <Pressable disabled={!koda.canContinueAreas} onPress={koda.startAreaDetails} style={[styles.primaryPillBottom, !koda.canContinueAreas && styles.disabled]}>
        <Text style={styles.primaryPillText}>Создать будущую версию</Text>
        <ArrowRight size={18} color={styles.tokens.accentText} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

function AreaDetailsScreen({ koda, styles }: { koda: ReturnType<typeof useFutureSelfOnboarding>; styles: KodaStyles }) {
  return (
    <ScrollView contentContainerStyle={styles.scrollScreen} keyboardShouldPersistTaps="handled">
      <ProgressDots activeIndex={3} styles={styles} />
      <Text style={styles.stepLabel}>
        СФЕРА {koda.areaIndex + 1} ИЗ {koda.selectedAreas.length}
      </Text>
      <Text style={styles.screenTitle}>{koda.currentArea?.title}: что болит сильнее всего?</Text>
      <Text style={styles.screenSubtitle}>Выбери боли, главный приоритет и коротко опиши, что изменится.</Text>

      <Text style={styles.sectionTitle}>Что беспокоит?</Text>
      <View style={styles.chipWrap}>
        {koda.currentArea?.pains.map((pain) => (
          <ChoiceChip key={pain} label={pain} selected={koda.draftPains.includes(pain)} styles={styles} onPress={() => koda.togglePain(pain)} />
        ))}
      </View>

      <Text style={styles.sectionTitle}>Если решить только одно?</Text>
      <View style={styles.chipWrap}>
        {koda.currentArea?.priorities.map((priority) => (
          <ChoiceChip
            key={priority}
            label={priority}
            selected={koda.draftPriority === priority}
            styles={styles}
            onPress={() => koda.setDraftPriority(priority)}
          />
        ))}
      </View>

      <Text style={styles.sectionTitle}>Что изменится в жизни?</Text>
      <TextInput
        multiline
        value={koda.draftMeaning}
        onChangeText={koda.setDraftMeaning}
        placeholder="Например: станет спокойнее, появится контроль, смогу думать о будущем."
        placeholderTextColor={styles.tokens.faint}
        style={styles.textArea}
        textAlignVertical="top"
      />

      <Pressable
        disabled={!koda.canContinueArea || koda.isLoading}
        onPress={koda.saveAreaDetails}
        style={[styles.primaryPillStatic, (!koda.canContinueArea || koda.isLoading) && styles.disabled]}
      >
        <Text style={styles.primaryPillText}>{koda.isLoading ? 'KODA думает...' : 'Продолжить'}</Text>
        <ArrowRight size={18} color={styles.tokens.accentText} strokeWidth={2.2} />
      </Pressable>
    </ScrollView>
  );
}

function ReflectionScreen({ koda, styles }: { koda: ReturnType<typeof useFutureSelfOnboarding>; styles: KodaStyles }) {
  return (
    <ScrollView contentContainerStyle={styles.scrollScreen}>
      <ProgressDots activeIndex={3} styles={styles} />
      <Text style={styles.stepLabel}>ОТРАЖЕНИЕ</Text>
      <Text style={styles.screenTitle}>KODA видит паттерн</Text>
      <View style={styles.aiBubbleWide}>
        <Text style={styles.aiBubbleText}>{koda.reflection}</Text>
      </View>
      {['Очень похоже', 'Частично похоже', 'Не совсем'].map((label) => (
        <Pressable key={label} onPress={() => koda.setStep('futureChanges')} style={styles.actionRow}>
          <Text style={styles.actionRowText}>{label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function FutureChangesScreen({ koda, styles }: { koda: ReturnType<typeof useFutureSelfOnboarding>; styles: KodaStyles }) {
  return (
    <View style={styles.screen}>
      <ProgressDots activeIndex={3} styles={styles} />
      <Text style={styles.stepLabel}>БУДУЩАЯ ВЕРСИЯ</Text>
      <Text style={styles.screenTitle}>Какие три изменения сделали бы тебя гордым?</Text>
      <TextInput
        multiline
        value={koda.futureChanges}
        onChangeText={koda.setFutureChanges}
        placeholder="Закрыл долги, сменил профессию, взял жизнь под контроль..."
        placeholderTextColor={styles.tokens.faint}
        style={styles.largeInput}
        textAlignVertical="top"
      />
      <Pressable disabled={!koda.canContinueFuture} onPress={() => koda.setStep('transformation')} style={[styles.primaryPillBottom, !koda.canContinueFuture && styles.disabled]}>
        <Text style={styles.primaryPillText}>Продолжить</Text>
        <ArrowRight size={18} color={styles.tokens.accentText} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

function TransformationScreen({ koda, styles }: { koda: ReturnType<typeof useFutureSelfOnboarding>; styles: KodaStyles }) {
  return (
    <View style={styles.screen}>
      <ProgressDots activeIndex={3} styles={styles} />
      <Text style={styles.stepLabel}>ТРАНСФОРМАЦИЯ</Text>
      <Text style={styles.screenTitle}>Какое качество отличает будущего тебя?</Text>
      <TextInput
        value={koda.transformation}
        onChangeText={koda.setTransformation}
        placeholder="Уверенность, дисциплина, спокойствие, системность..."
        placeholderTextColor={styles.tokens.faint}
        style={styles.singleInput}
      />
      <Pressable
        disabled={!koda.canContinueTransformation || koda.isLoading}
        onPress={koda.buildFutureSelf}
        style={[styles.primaryPillBottom, (!koda.canContinueTransformation || koda.isLoading) && styles.disabled]}
      >
        <Text style={styles.primaryPillText}>{koda.isLoading ? 'Собираю...' : 'Создать будущую версию'}</Text>
        <ArrowRight size={18} color={styles.tokens.accentText} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

function FutureSelfScreen({ koda, styles }: { koda: ReturnType<typeof useFutureSelfOnboarding>; styles: KodaStyles }) {
  return (
    <ScrollView contentContainerStyle={styles.scrollScreen}>
      <ProgressDots activeIndex={3} styles={styles} />
      <Text style={styles.stepLabel}>БУДУЩАЯ ВЕРСИЯ</Text>
      <Text style={styles.screenTitle}>{koda.futureSelf?.title}</Text>
      <View style={styles.futureCard}>
        <Text style={styles.futureDescription}>{koda.futureSelf?.description}</Text>
        {koda.futureSelf?.traits.map((trait) => (
          <View key={trait} style={styles.traitRow}>
            <View style={styles.smallCheck}>
              <Check size={13} color={styles.tokens.accentText} strokeWidth={3} />
            </View>
            <Text style={styles.traitText}>{trait}</Text>
          </View>
        ))}
      </View>
      <Pressable onPress={() => koda.setStep('confirm')} style={styles.primaryPillStatic}>
        <Text style={styles.primaryPillText}>Продолжить</Text>
        <ArrowRight size={18} color={styles.tokens.accentText} strokeWidth={2.2} />
      </Pressable>
    </ScrollView>
  );
}

function ConfirmScreen({ koda, styles }: { koda: ReturnType<typeof useFutureSelfOnboarding>; styles: KodaStyles }) {
  return (
    <View style={styles.screen}>
      <ProgressDots activeIndex={3} styles={styles} />
      <Text style={styles.stepLabel}>ПОДТВЕРЖДЕНИЕ</Text>
      <Text style={styles.screenTitle}>Насколько эта версия похожа на человека, которым ты хочешь стать?</Text>
      {['Это точно я', 'Почти', 'Нужно изменить'].map((label) => (
        <Pressable
          key={label}
          onPress={() => (label === 'Нужно изменить' ? koda.setStep('futureChanges') : koda.setStep('ready'))}
          style={styles.actionRow}
        >
          <Text style={styles.actionRowText}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function ReadyScreen({ styles, onComplete }: { styles: KodaStyles; onComplete: () => void }) {
  return (
    <View style={styles.centerScreen}>
      <View style={styles.appIcon}>
        <Check size={28} color="#050505" strokeWidth={2.4} />
      </View>
      <Text style={styles.introTitle}>Будущая версия создана</Text>
      <Text style={styles.introCopy}>Первый дашборд готов.</Text>
      <Pressable onPress={onComplete} style={styles.primaryPill}>
        <Text style={styles.primaryPillText}>Открыть дашборд</Text>
        <ArrowRight size={18} color={styles.tokens.accentText} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

function ChoiceChip({
  label,
  selected,
  styles,
  onPress,
}: {
  label: string;
  selected: boolean;
  styles: KodaStyles;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.choiceChip, selected && styles.choiceChipSelected]}>
      <Text style={styles.choiceChipText}>{label}</Text>
    </Pressable>
  );
}

function ProgressDots({ activeIndex, styles }: { activeIndex: number; styles: KodaStyles }) {
  return (
    <View style={styles.dots}>
      {[0, 1, 2, 3].map((index) => (
        <View key={index} style={[styles.dot, index === activeIndex && styles.dotActive]} />
      ))}
    </View>
  );
}

function ArchetypeProgressFrame({
  activeTarget,
  scores,
  styles,
}: {
  activeTarget: SandTarget | null;
  scores: Scores;
  styles: KodaStyles;
}) {
  const player = useRef(new Animated.Value(scoreRatio(scores.player))).current;
  const analyst = useRef(new Animated.Value(scoreRatio(scores.analyst))).current;
  const empath = useRef(new Animated.Value(scoreRatio(scores.empath))).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(player, {
        toValue: scoreRatio(scores.player),
        duration: 1280,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(analyst, {
        toValue: scoreRatio(scores.analyst),
        duration: 1280,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(empath, {
        toValue: scoreRatio(scores.empath),
        duration: 1280,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();
  }, [analyst, empath, player, scores.analyst, scores.empath, scores.player]);

  useEffect(() => {
    if (!activeTarget) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 640,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 640,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ]),
    ).start();
  }, [activeTarget, pulse]);

  return (
    <View pointerEvents="none" style={styles.constellationLayer}>
      <View style={[styles.constellationLine, styles.constellationLineTop]} />
      <View style={[styles.constellationLine, styles.constellationLineLeft]} />
      <View style={[styles.constellationLine, styles.constellationLineRight]} />
      <ConstellationNode active={activeTarget === 'player'} progress={player} pulse={pulse} styles={styles} variant="left" />
      <ConstellationNode active={activeTarget === 'analyst'} progress={analyst} pulse={pulse} styles={styles} variant="right" />
      <ConstellationNode active={activeTarget === 'empath'} progress={empath} pulse={pulse} styles={styles} variant="bottom" />
    </View>
  );
}

function ConstellationNode({
  active,
  progress,
  pulse,
  styles,
  variant,
}: {
  active: boolean;
  progress: Animated.Value;
  pulse: Animated.Value;
  styles: KodaStyles;
  variant: 'left' | 'right' | 'bottom';
}) {
  const positionStyle =
    variant === 'left' ? styles.constellationNodeLeft : variant === 'right' ? styles.constellationNodeRight : styles.constellationNodeBottom;
  const size = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 26],
  });
  const glowOpacity = active
    ? pulse.interpolate({
        inputRange: [0, 1],
        outputRange: [0.68, 1],
      })
    : progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0.12, 0.42],
      });
  const haloScale = active
    ? pulse.interpolate({
        inputRange: [0, 1],
        outputRange: [0.98, 1.18],
      })
    : 1;

  return (
    <View style={[styles.constellationNode, positionStyle]}>
      <Animated.View style={[styles.constellationHalo, active && styles.constellationHaloActive, { opacity: glowOpacity, transform: [{ scale: haloScale }] }]} />
      <View style={[styles.constellationOrbit, active && styles.constellationOrbitActive]}>
        <View style={[styles.orbitDot, styles.orbitDotTop, active && styles.orbitDotActive]} />
        <View style={[styles.orbitDot, styles.orbitDotLeft, active && styles.orbitDotActive]} />
        <View style={[styles.orbitDot, styles.orbitDotRight, active && styles.orbitDotActive]} />
        <View style={[styles.orbitDot, styles.orbitDotBottom, active && styles.orbitDotActive]} />
      </View>
      <View style={[styles.constellationRing, active && styles.constellationRingActive]}>
        <View style={[styles.constellationInnerGlow, active && styles.constellationInnerGlowActive]} />
        <View style={styles.constellationInnerShade} />
        {active ? (
          <>
            <View style={styles.constellationImpact} />
            <View style={[styles.nodeDust, styles.nodeDustOne]} />
            <View style={[styles.nodeDust, styles.nodeDustTwo]} />
            <View style={[styles.nodeDust, styles.nodeDustThree]} />
            <View style={[styles.nodeDust, styles.nodeDustFour]} />
          </>
        ) : null}
        <Animated.View style={[styles.constellationCore, active && styles.constellationCoreActive, { height: size, width: size }]} />
      </View>
    </View>
  );
}

function SandTrail({
  questionIndex,
  text,
  target,
  styles,
}: {
  questionIndex: number;
  text: string;
  target: SandTarget;
  styles: KodaStyles;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!text) {
      progress.setValue(0);
      return;
    }

    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 1800,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress, target, text]);

  if (!text) {
    return null;
  }

  const path = sandTrajectories[target];
  const grainSource = `${text} ${text} ${text}`;
  const grains = grainSource.slice(0, 92).split('');
  const startTop = path.startY + Math.min(questionIndex * 28, 70);

  return (
    <View pointerEvents="none" style={styles.sandLayer}>
      {grains.map((char, index) => {
        const delay = Math.min(0.72, 0.02 + index * 0.006);
        const appearEnd = delay + 0.08;
        const readableEnd = Math.min(0.9, delay + 0.56);
        const dissolveStart = Math.min(0.92, delay + 0.7);
        const streamSpread = (index % 9) * 8 - 32;
        const verticalNoise = (index % 7) * 9 - 24;

        return (
          <Animated.Text
            key={`${char}-${index}`}
            style={[
              styles.sandGrain,
              {
                left: path.startX + (index % 12) * 7,
                opacity: progress.interpolate({
                  inputRange: [0, delay, appearEnd, readableEnd, 1],
                  outputRange: [0, 0, 1, 0.72, 0],
                }),
                top: startTop + (index % 5) * 7,
                transform: [
                  {
                    translateX: progress.interpolate({
                      inputRange: [0, delay, 1],
                      outputRange: [0, 0, path.x + streamSpread],
                    }),
                  },
                  {
                    translateY: progress.interpolate({
                      inputRange: [0, delay, dissolveStart, 1],
                      outputRange: [0, 0, path.y * 0.62 + verticalNoise, path.y + verticalNoise * 0.4],
                    }),
                  },
                  {
                    scale: progress.interpolate({
                      inputRange: [0, readableEnd, 1],
                      outputRange: [1, 0.86, 0.18],
                    }),
                  },
                ],
              },
            ]}
          >
            {char}
          </Animated.Text>
        );
      })}
      {Array.from({ length: 140 }).map((_, index) => {
        const delay = Math.min(0.68, 0.015 + index * 0.006);
        const spread = (index % 15) * 11 - 72;
        const drift = (index % 11) * 8 - 38;

        return (
          <Animated.View
            key={`dust-${index}`}
            style={[
              styles.cosmicDust,
              {
                left: path.startX + (index % 28) * 4,
                opacity: progress.interpolate({
                  inputRange: [0, delay, Math.min(delay + 0.1, 0.8), 1],
                  outputRange: [0, 0, 0.85, 0],
                }),
                top: startTop + (index % 6) * 5,
                transform: [
                  {
                    translateX: progress.interpolate({
                      inputRange: [0, delay, 1],
                      outputRange: [0, 0, path.x + spread],
                    }),
                  },
                  {
                    translateY: progress.interpolate({
                      inputRange: [0, delay, 1],
                      outputRange: [0, 0, path.y + drift],
                    }),
                  },
                  {
                    scale: progress.interpolate({
                      inputRange: [0, 0.6, 1],
                      outputRange: [0.35, 1, 0.2],
                    }),
                  },
                ],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const sandTrajectories: Record<SandTarget, { startX: number; startY: number; x: number; y: number }> = {
  player: { startX: 520, startY: 486, x: -360, y: -58 },
  analyst: { startX: 680, startY: 486, x: 310, y: -58 },
  empath: { startX: 620, startY: 486, x: -10, y: 188 },
};

function scoreRatio(score: number) {
  return Math.min(1, score / (onboardingQuestions.length * 2));
}

function getDominantScore(scores: Partial<Scores>): SandTarget {
  const entries = Object.entries(scores) as Array<[Archetype, number]>;
  return entries.sort((a, b) => b[1] - a[1])[0]?.[0] || 'player';
}

function addScores(current: Scores, addition: Partial<Scores>): Scores {
  return {
    player: current.player + (addition.player || 0),
    analyst: current.analyst + (addition.analyst || 0),
    empath: current.empath + (addition.empath || 0),
  };
}

function getTopArchetype(scores: Scores): Archetype {
  const entries = Object.entries(scores) as Array<[Archetype, number]>;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

function buildFutureSignal(insights: string[], archetype: Archetype) {
  const top = archetypeNames[archetype].toLowerCase();
  return `Собрать путь под текущий режим "${top}": ${insights.slice(0, 4).join(', ')}.`;
}

function makeStyles(palette: (typeof palettes)['dark']) {
  return {
    tokens: palette,
    ...StyleSheet.create({
      safeArea: {
        backgroundColor: palette.app,
        flex: 1,
      },
      stage: {
        alignItems: 'center',
        backgroundColor: palette.app,
        flex: 1,
      },
      shell: {
        backgroundColor: palette.app,
        flex: 1,
        maxWidth: 1180,
        width: '100%',
      },
      themeToggle: {
        alignItems: 'center',
        borderColor: palette.line,
        borderRadius: 999,
        borderWidth: 1,
        height: 80,
        justifyContent: 'center',
        position: 'absolute',
        right: 80,
        top: 84,
        width: 80,
        zIndex: 10,
      },
      centerScreen: {
        alignItems: 'center',
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 70,
      },
      appIcon: {
        alignItems: 'center',
        backgroundColor: '#F1F1F1',
        borderRadius: 20,
        height: 64,
        justifyContent: 'center',
        marginBottom: 28,
        width: 64,
      },
      introTitle: {
        color: palette.text,
        fontSize: 28,
        fontWeight: '700',
        letterSpacing: 0,
        lineHeight: 34,
        maxWidth: 420,
        textAlign: 'center',
      },
      introCopy: {
        color: palette.muted,
        fontSize: 16,
        fontWeight: '400',
        lineHeight: 24,
        marginBottom: 34,
        marginTop: 18,
        maxWidth: 430,
        textAlign: 'center',
      },
      primaryPill: {
        alignItems: 'center',
        backgroundColor: palette.accent,
        borderRadius: 999,
        flexDirection: 'row',
        gap: 10,
        justifyContent: 'center',
        maxWidth: 320,
        minHeight: 46,
        width: '100%',
      },
      primaryPillBottom: {
        alignItems: 'center',
        backgroundColor: palette.accent,
        borderRadius: 999,
        bottom: 28,
        flexDirection: 'row',
        gap: 10,
        justifyContent: 'center',
        left: 30,
        minHeight: 46,
        position: 'absolute',
        right: 30,
      },
      primaryPillStatic: {
        alignItems: 'center',
        backgroundColor: palette.accent,
        borderRadius: 999,
        flexDirection: 'row',
        gap: 10,
        justifyContent: 'center',
        marginTop: 22,
        minHeight: 46,
      },
      primaryPillText: {
        color: palette.accentText,
        fontSize: 15,
        fontWeight: '700',
      },
      textButton: {
        marginTop: 16,
        padding: 8,
      },
      textButtonText: {
        color: palette.faint,
        fontSize: 14,
        fontWeight: '400',
      },
      screen: {
        flex: 1,
        overflow: 'hidden',
        paddingBottom: 118,
        paddingHorizontal: 64,
        paddingTop: 70,
      },
      scrollScreen: {
        flexGrow: 1,
        paddingBottom: 32,
        paddingHorizontal: 30,
        paddingTop: 8,
      },
      chatScroll: {
        flex: 1,
        marginTop: 72,
        zIndex: 6,
      },
      chatContent: {
        gap: 0,
        minHeight: 500,
        paddingBottom: 260,
      },
      constellationLayer: {
        bottom: 0,
        left: 0,
        position: 'absolute',
        right: 0,
        top: 0,
        zIndex: 0,
      },
      constellationLine: {
        backgroundColor: palette.constellationLine,
        height: 1,
        opacity: 0.78,
        position: 'absolute',
      },
      constellationLineTop: {
        left: 180,
        top: 408,
        width: 810,
      },
      constellationLineLeft: {
        left: 218,
        top: 585,
        transform: [{ rotate: '54deg' }],
        width: 520,
      },
      constellationLineRight: {
        right: 218,
        top: 585,
        transform: [{ rotate: '-54deg' }],
        width: 520,
      },
      constellationNode: {
        alignItems: 'center',
        height: 140,
        justifyContent: 'center',
        position: 'absolute',
        width: 140,
      },
      constellationNodeLeft: {
        left: 72,
        top: 338,
      },
      constellationNodeRight: {
        right: 72,
        top: 338,
      },
      constellationNodeBottom: {
        left: 520,
        top: 650,
      },
      constellationHalo: {
        backgroundColor: palette.constellationGlow,
        borderRadius: 999,
        height: 122,
        opacity: 0.14,
        position: 'absolute',
        width: 122,
      },
      constellationHaloActive: {
        backgroundColor: palette.goldGlow,
        opacity: 0.72,
        shadowColor: palette.gold,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 46,
      },
      constellationOrbit: {
        borderColor: palette.orbitLine,
        borderRadius: 999,
        borderWidth: 1,
        height: 132,
        position: 'absolute',
        width: 132,
      },
      constellationOrbitActive: {
        borderColor: palette.gold,
      },
      orbitDot: {
        backgroundColor: palette.orbitDot,
        borderRadius: 999,
        height: 5,
        position: 'absolute',
        width: 5,
      },
      orbitDotActive: {
        backgroundColor: palette.goldCore,
      },
      orbitDotTop: {
        left: 62,
        top: -2,
      },
      orbitDotLeft: {
        left: -2,
        top: 61,
      },
      orbitDotRight: {
        right: 8,
        top: 25,
      },
      orbitDotBottom: {
        bottom: 9,
        left: 33,
      },
      constellationRing: {
        alignItems: 'center',
        backgroundColor: palette.constellationNode,
        borderColor: palette.constellationLine,
        borderRadius: 999,
        borderWidth: 1,
        height: 86,
        justifyContent: 'center',
        overflow: 'hidden',
        width: 86,
      },
      constellationRingActive: {
        borderColor: palette.goldCore,
        shadowColor: palette.gold,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.85,
        shadowRadius: 32,
      },
      constellationCore: {
        backgroundColor: palette.core,
        borderRadius: 999,
        minHeight: 7,
        minWidth: 7,
        opacity: 0.7,
        shadowColor: palette.core,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.95,
        shadowRadius: 16,
      },
      constellationCoreActive: {
        backgroundColor: palette.goldCore,
        opacity: 1,
        shadowColor: palette.goldCore,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 24,
      },
      constellationInnerGlow: {
        backgroundColor: palette.innerGlow,
        borderRadius: 999,
        height: 74,
        opacity: 0.58,
        position: 'absolute',
        width: 74,
      },
      constellationInnerGlowActive: {
        backgroundColor: palette.goldGlow,
        opacity: 0.9,
      },
      constellationInnerShade: {
        borderColor: palette.constellationLine,
        borderRadius: 999,
        borderWidth: 1,
        height: 50,
        opacity: 0.48,
        position: 'absolute',
        width: 50,
      },
      constellationImpact: {
        backgroundColor: palette.goldCore,
        borderRadius: 999,
        height: 18,
        opacity: 0.95,
        position: 'absolute',
        right: 7,
        shadowColor: palette.goldCore,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 18,
        width: 18,
      },
      nodeDust: {
        backgroundColor: palette.goldCore,
        borderRadius: 999,
        height: 3,
        opacity: 0.8,
        position: 'absolute',
        shadowColor: palette.goldCore,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 8,
        width: 3,
      },
      nodeDustOne: {
        right: 22,
        top: 22,
      },
      nodeDustTwo: {
        right: 34,
        top: 50,
      },
      nodeDustThree: {
        left: 28,
        top: 34,
      },
      nodeDustFour: {
        bottom: 22,
        left: 43,
      },
      sideProgressLeft: {
        backgroundColor: palette.progressTrack,
        borderRadius: 999,
        height: 510,
        justifyContent: 'flex-end',
        left: 10,
        overflow: 'hidden',
        position: 'absolute',
        top: 118,
        width: 4,
        zIndex: 2,
      },
      sideProgressRight: {
        backgroundColor: palette.progressTrack,
        borderRadius: 999,
        height: 510,
        justifyContent: 'flex-end',
        overflow: 'hidden',
        position: 'absolute',
        right: 10,
        top: 118,
        width: 4,
        zIndex: 2,
      },
      bottomProgress: {
        backgroundColor: palette.progressTrack,
        borderRadius: 999,
        bottom: 18,
        height: 4,
        left: 44,
        overflow: 'hidden',
        position: 'absolute',
        right: 44,
        zIndex: 2,
      },
      progressRailActive: {
        boxShadow: `0 0 18px ${palette.progressSpark}`,
        shadowColor: palette.progressSpark,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 18,
      },
      verticalProgressFill: {
        alignSelf: 'stretch',
        backgroundColor: palette.progressFill,
        borderRadius: 999,
        minHeight: 2,
        overflow: 'hidden',
        position: 'relative',
      },
      horizontalProgressFill: {
        alignSelf: 'stretch',
        backgroundColor: palette.progressFill,
        borderRadius: 999,
        height: '100%',
        minWidth: 2,
        overflow: 'hidden',
        position: 'relative',
      },
      progressFillActive: {
        backgroundColor: palette.progressActive,
        shadowColor: palette.progressSpark,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.55,
        shadowRadius: 6,
      },
      progressGlowVertical: {
        backgroundColor: palette.progressSpark,
        borderRadius: 999,
        bottom: 3,
        left: 0,
        opacity: 0.48,
        position: 'absolute',
        right: 0,
        top: 3,
      },
      progressSparkVertical: {
        alignSelf: 'stretch',
        backgroundColor: palette.progressSpark,
        borderRadius: 999,
        height: 34,
        opacity: 1,
      },
      progressGlowHorizontal: {
        backgroundColor: palette.progressSpark,
        borderRadius: 999,
        bottom: 0,
        left: 3,
        opacity: 0.48,
        position: 'absolute',
        right: 3,
        top: 0,
      },
      progressSparkHorizontal: {
        alignSelf: 'flex-end',
        backgroundColor: palette.progressSpark,
        borderRadius: 999,
        height: '100%',
        opacity: 1,
        width: 38,
      },
      sandLayer: {
        bottom: 0,
        left: 0,
        position: 'absolute',
        right: 0,
        top: 0,
        zIndex: 5,
      },
      sandGrain: {
        color: palette.goldCore,
        fontSize: 16,
        fontWeight: '400',
        lineHeight: 18,
        position: 'absolute',
        textShadowColor: palette.gold,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 14,
      },
      cosmicDust: {
        backgroundColor: palette.goldCore,
        borderRadius: 999,
        height: 3,
        position: 'absolute',
        shadowColor: palette.goldCore,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 8,
        width: 3,
      },
      dots: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: 16,
        justifyContent: 'center',
        left: 0,
        marginBottom: 0,
        position: 'absolute',
        right: 0,
        top: 4,
        zIndex: 12,
      },
      dot: {
        backgroundColor: palette.line,
        borderRadius: 999,
        height: 10,
        width: 44,
      },
      dotActive: {
        backgroundColor: palette.active,
        width: 44,
      },
      stepLabel: {
        color: palette.orange,
        fontSize: 25,
        fontWeight: '700',
        letterSpacing: 0,
        marginBottom: 22,
      },
      screenTitle: {
        color: palette.text,
        fontSize: 44,
        fontWeight: '700',
        letterSpacing: 0,
        lineHeight: 52,
      },
      screenSubtitle: {
        color: palette.muted,
        fontSize: 15,
        fontWeight: '400',
        lineHeight: 22,
        marginTop: 8,
      },
      systemPurpose: {
        color: palette.muted,
        fontSize: 13,
        fontWeight: '400',
        lineHeight: 19,
        marginTop: 10,
      },
      optionList: {
        gap: 12,
        marginTop: 28,
      },
      dialogueBody: {
        gap: 12,
        paddingTop: 26,
      },
      optionDock: {
        alignItems: 'flex-end',
        gap: 8,
        left: 565,
        position: 'absolute',
        right: 190,
        top: 430,
        zIndex: 12,
      },
      optionDockFollowup: {
        top: 560,
      },
      inputDock: {
        alignItems: 'center',
        borderColor: palette.bubbleLine,
        borderRadius: 999,
        borderWidth: 1,
        bottom: 18,
        flexDirection: 'row',
        height: 70,
        justifyContent: 'space-between',
        left: 56,
        paddingLeft: 34,
        paddingRight: 22,
        position: 'absolute',
        right: 56,
        zIndex: 3,
      },
      inputPlaceholder: {
        color: palette.faint,
        fontSize: 24,
        fontWeight: '400',
      },
      inputSendButton: {
        alignItems: 'center',
        backgroundColor: palette.userBubble,
        borderRadius: 999,
        height: 48,
        justifyContent: 'center',
        paddingHorizontal: 26,
      },
      inputSendText: {
        color: palette.userText,
        fontSize: 20,
        fontWeight: '500',
      },
      answerOption: {
        alignItems: 'center',
        alignSelf: 'flex-end',
        backgroundColor: palette.userBubble,
        borderRadius: 26,
        flexDirection: 'row',
        gap: 12,
        justifyContent: 'space-between',
        maxWidth: 420,
        minHeight: 50,
        paddingHorizontal: 24,
        paddingVertical: 10,
      },
      answerOptionSelected: {
        borderColor: palette.active,
      },
      answerOptionText: {
        color: palette.userText,
        flex: 1,
        fontSize: 19,
        fontWeight: '400',
        lineHeight: 25,
      },
      optionMark: {
        alignItems: 'center',
        borderColor: palette.line,
        borderRadius: 999,
        borderWidth: 1,
        height: 22,
        justifyContent: 'center',
        width: 22,
      },
      optionMarkSelected: {
        backgroundColor: palette.accent,
        borderColor: palette.accent,
      },
      aiBubbleWide: {
        alignSelf: 'flex-start',
        backgroundColor: palette.aiBubble,
        borderColor: palette.bubbleLine,
        borderRadius: 42,
        borderWidth: 1,
        marginLeft: 172,
        marginTop: 0,
        maxWidth: 560,
        paddingHorizontal: 42,
        paddingVertical: 30,
        shadowColor: '#FFFFFF',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
      },
      aiBubbleTail: {
        backgroundColor: palette.aiBubble,
        bottom: -10,
        height: 26,
        left: 34,
        position: 'absolute',
        transform: [{ rotate: '45deg' }],
        width: 26,
      },
      aiBubbleText: {
        color: palette.text,
        fontSize: 27,
        fontWeight: '400',
        lineHeight: 42,
      },
      userBubble: {
        alignSelf: 'flex-end',
        backgroundColor: palette.userBubble,
        borderRadius: 38,
        marginRight: 220,
        marginTop: 8,
        maxWidth: 450,
        paddingHorizontal: 42,
        paddingVertical: 24,
        zIndex: 9,
      },
      userBubbleTail: {
        backgroundColor: palette.userBubble,
        bottom: -9,
        height: 24,
        position: 'absolute',
        right: 24,
        transform: [{ rotate: '45deg' }],
        width: 24,
      },
      userBubbleText: {
        color: palette.userText,
        fontSize: 27,
        fontWeight: '400',
        lineHeight: 40,
      },
      revealCard: {
        backgroundColor: palette.panel,
        borderColor: palette.line,
        borderRadius: 24,
        borderWidth: 1,
        marginTop: 28,
        padding: 20,
      },
      revealLabel: {
        color: palette.orange,
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 10,
      },
      revealTitle: {
        color: palette.text,
        fontSize: 20,
        fontWeight: '700',
        lineHeight: 26,
      },
      revealText: {
        color: palette.text,
        fontSize: 15,
        fontWeight: '400',
        lineHeight: 23,
        marginTop: 12,
      },
      profileLine: {
        borderTopColor: palette.line,
        borderTopWidth: 1,
        gap: 4,
        marginTop: 14,
        paddingTop: 12,
      },
      profileLineLabel: {
        color: palette.orange,
        fontSize: 12,
        fontWeight: '600',
      },
      profileLineText: {
        color: palette.text,
        fontSize: 14,
        fontWeight: '400',
        lineHeight: 20,
      },
      revealHint: {
        color: palette.muted,
        fontSize: 14,
        fontWeight: '400',
        lineHeight: 21,
        marginTop: 14,
      },
      focusGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginTop: 28,
      },
      focusPill: {
        alignItems: 'center',
        backgroundColor: palette.panel,
        borderColor: palette.line,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        minHeight: 54,
        paddingLeft: 18,
        paddingRight: 14,
        width: '48%',
      },
      focusPillSelected: {
        borderColor: palette.active,
      },
      focusText: {
        color: palette.text,
        flex: 1,
        fontSize: 15,
        fontWeight: '600',
      },
      focusCheck: {
        alignItems: 'center',
        borderColor: palette.line,
        borderRadius: 999,
        borderWidth: 1,
        height: 21,
        justifyContent: 'center',
        width: 21,
      },
      focusCheckSelected: {
        backgroundColor: palette.accent,
        borderColor: palette.accent,
      },
      disabled: {
        opacity: 0.45,
      },
      sectionTitle: {
        color: palette.text,
        fontSize: 15,
        fontWeight: '700',
        marginBottom: 10,
        marginTop: 24,
      },
      chipWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 9,
      },
      choiceChip: {
        backgroundColor: palette.panel,
        borderColor: palette.line,
        borderRadius: 999,
        borderWidth: 1,
        paddingHorizontal: 14,
        paddingVertical: 10,
      },
      choiceChipSelected: {
        borderColor: palette.active,
      },
      choiceChipText: {
        color: palette.text,
        fontSize: 14,
        fontWeight: '500',
      },
      textArea: {
        backgroundColor: palette.panel,
        borderColor: palette.line,
        borderRadius: 20,
        borderWidth: 1,
        color: palette.text,
        fontSize: 15,
        fontWeight: '400',
        lineHeight: 22,
        minHeight: 118,
        padding: 16,
      },
      largeInput: {
        backgroundColor: palette.panel,
        borderColor: palette.line,
        borderRadius: 20,
        borderWidth: 1,
        color: palette.text,
        fontSize: 15,
        fontWeight: '400',
        lineHeight: 22,
        marginTop: 28,
        minHeight: 210,
        padding: 16,
      },
      singleInput: {
        backgroundColor: palette.panel,
        borderColor: palette.line,
        borderRadius: 999,
        borderWidth: 1,
        color: palette.text,
        fontSize: 15,
        fontWeight: '400',
        marginTop: 28,
        minHeight: 48,
        paddingHorizontal: 16,
      },
      actionRow: {
        backgroundColor: palette.panel,
        borderColor: palette.line,
        borderRadius: 20,
        borderWidth: 1,
        justifyContent: 'center',
        marginTop: 12,
        minHeight: 56,
        paddingHorizontal: 16,
      },
      actionRowText: {
        color: palette.text,
        fontSize: 16,
        fontWeight: '600',
      },
      futureCard: {
        backgroundColor: palette.panel,
        borderColor: palette.line,
        borderRadius: 22,
        borderWidth: 1,
        marginTop: 24,
        padding: 18,
      },
      futureDescription: {
        color: palette.muted,
        fontSize: 15,
        fontWeight: '400',
        lineHeight: 23,
        marginBottom: 16,
      },
      traitRow: {
        alignItems: 'flex-start',
        flexDirection: 'row',
        gap: 10,
        marginTop: 10,
      },
      smallCheck: {
        alignItems: 'center',
        backgroundColor: palette.accent,
        borderRadius: 999,
        height: 20,
        justifyContent: 'center',
        marginTop: 1,
        width: 20,
      },
      traitText: {
        color: palette.text,
        flex: 1,
        fontSize: 15,
        fontWeight: '500',
        lineHeight: 22,
      },
    }),
  };
}
