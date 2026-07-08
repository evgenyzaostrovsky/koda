import { type CSSProperties, type MouseEvent, useEffect, useRef, useState } from 'react';
import { DEFAULT_MAX_SPHERE_CHARGE, KodaSphere } from './KodaSphere';
import { SpeechBubble } from './SpeechBubble';
import type { KodaOrbitDot } from './KodaSphere';

const MAX_SPHERE_CHARGE = DEFAULT_MAX_SPHERE_CHARGE;
const FLIGHT_MAX_DURATION_MS = 2000;
const FLIGHT_MIN_DURATION_MS = 900;
const FLIGHT_MOVE_END_PROGRESS = 0.92;
const FLIGHT_MOVE_START_PROGRESS = 0.16;
const FLIGHT_REACTION_LEAD_MS = 390;
const FLIGHT_SPEED_PX_PER_MS = 0.15;
const SPHERE_REACTION_RADIUS_RATIO = 92 / 220;

const FLIGHT_PARTICLE_COUNT = 304;
const FLIGHT_LETTERS = 'кодапутьцельфокусростxpбудущеесебя'.split('');
const FLIGHT_LETTER_COUNT = 72;
const ANSWER_DUST_DOT_COUNT = 180;

type ArchetypeKey = 'analyst' | 'empath' | 'player';
type SphereKey = 'bottom' | 'left' | 'right';

type DialogueOption = {
  archetype: ArchetypeKey;
  label: string;
  sphere: SphereKey;
};

type DialogueQuestion = {
  eyebrow: string;
  options: DialogueOption[];
  prompt: string;
  title: string;
};

type FocusAreaKey = 'money' | 'health' | 'discipline' | 'career' | 'relationships' | 'calm';

type AreaDetailDraft = {
  areaId: FocusAreaKey;
  meaning: string;
  pains: string[];
  priority: string;
};

const focusAreas: Array<{ id: FocusAreaKey; label: string; hint: string }> = [
  { id: 'money', label: 'Финансы', hint: 'долги, доход, подушка' },
  { id: 'health', label: 'Здоровье', hint: 'сон, вес, энергия' },
  { id: 'discipline', label: 'Дисциплина', hint: 'фокус, порядок, ритм' },
  { id: 'career', label: 'Карьера', hint: 'роль, навыки, рост' },
  { id: 'relationships', label: 'Отношения', hint: 'семья, близость, опора' },
  { id: 'calm', label: 'Спокойствие', hint: 'тревога, перегруз, устойчивость' },
];

const areaDetailOptions: Record<FocusAreaKey, { pains: string[]; priorities: string[]; placeholder: string }> = {
  money: {
    pains: ['Долги / кредиты', 'Нестабильный доход', 'Хаос в расходах', 'Нет подушки', 'Страх будущего'],
    priorities: ['Увеличить доход', 'Закрыть долги', 'Навести порядок', 'Создать запас'],
    placeholder: 'Например: хочу перестать жить от платежа до платежа и видеть, куда уходят деньги.',
  },
  health: {
    pains: ['Мало энергии', 'Плохой сон', 'Вес / форма', 'Нет режима', 'Быстро выгораю'],
    priorities: ['Вернуть сон', 'Поднять энергию', 'Собрать режим', 'Начать движение'],
    placeholder: 'Например: хочу просыпаться без ощущения, что батарейка уже на нуле.',
  },
  discipline: {
    pains: ['Расфокус', 'Бросаю начатое', 'Хаос в делах', 'Прокрастинация', 'Нет системы'],
    priorities: ['Собрать ритм', 'Упростить старт', 'Держать фокус', 'Доводить до конца'],
    placeholder: 'Например: хочу перестать каждый день начинать с нуля и держать понятный ритм.',
  },
  career: {
    pains: ['Не расту', 'Нет понятного трека', 'Мало навыков', 'Страх смены роли', 'Нет портфолио'],
    priorities: ['Выбрать роль', 'Прокачать навык', 'Собрать портфолио', 'Увеличить доход'],
    placeholder: 'Например: хочу видеть следующий профессиональный шаг и делать его без хаоса.',
  },
  relationships: {
    pains: ['Мало близости', 'Нет времени', 'Конфликты', 'Тяну всё один', 'Не прошу поддержки'],
    priorities: ['Больше контакта', 'Говорить честнее', 'Просить поддержку', 'Вернуть тепло'],
    placeholder: 'Например: хочу быть ближе к важным людям и не тащить всё молча.',
  },
  calm: {
    pains: ['Тревога', 'Перегруз', 'Внутреннее давление', 'Нет отдыха', 'Сложно замедлиться'],
    priorities: ['Снизить шум', 'Вернуть опору', 'Научиться отдыхать', 'Собрать границы'],
    placeholder: 'Например: хочу чувствовать внутри больше тишины и меньше постоянной гонки.',
  },
};

const dialogueQuestions: DialogueQuestion[] = [
  {
    eyebrow: 'ЗНАКОМСТВО',
    title: 'Короткая беседа',
    prompt: 'Привет. Я KODA. Я помогу тебе лучше понять себя. Расскажи — что чаще всего тебя двигает вперёд?',
    options: [
      { archetype: 'player', sphere: 'left', label: 'Желание выиграть, обойти себя вчерашнего' },
      { archetype: 'analyst', sphere: 'right', label: 'Желание разобраться, как всё устроено' },
      { archetype: 'empath', sphere: 'bottom', label: 'Желание чувствовать связь с людьми' },
    ],
  },
  {
    eyebrow: 'КОНТЕКСТ',
    title: 'Как ты входишь в задачу',
    prompt: 'Когда ты сталкиваешься со сложной задачей — что ты делаешь в первые минуты?',
    options: [
      { archetype: 'player', sphere: 'left', label: 'Беру и пробую — разберусь по ходу' },
      { archetype: 'analyst', sphere: 'right', label: 'Раскладываю на части, ищу логику' },
      { archetype: 'empath', sphere: 'bottom', label: 'Думаю, кто уже сталкивался, с кем обсудить' },
    ],
  },
  {
    eyebrow: 'ЭНЕРГИЯ',
    title: 'Где появляется заряд',
    prompt: 'Что даёт тебе больше всего энергии в конце дня?',
    options: [
      { archetype: 'player', sphere: 'left', label: 'Ощущение, что я сегодня победил' },
      { archetype: 'analyst', sphere: 'right', label: 'Ясность — я понял что-то новое' },
      { archetype: 'empath', sphere: 'bottom', label: 'Тёплый разговор или помощь кому-то' },
    ],
  },
  {
    eyebrow: 'ПРЕПЯТСТВИЯ',
    title: 'Что сбивает ритм',
    prompt: 'А что чаще всего тебя тормозит?',
    options: [
      { archetype: 'player', sphere: 'left', label: 'Скука, отсутствие вызова' },
      { archetype: 'analyst', sphere: 'right', label: 'Когда нет данных и непонятно, куда идти' },
      { archetype: 'empath', sphere: 'bottom', label: 'Напряжение в отношениях или одиночество' },
    ],
  },
  {
    eyebrow: 'БУДУЩЕЕ',
    title: 'Первый контур себя',
    prompt: 'Если бы ты увидел себя через год — что бы тебе хотелось почувствовать в первую очередь?',
    options: [
      { archetype: 'player', sphere: 'left', label: 'Что я стал сильнее и быстрее' },
      { archetype: 'analyst', sphere: 'right', label: 'Что я наконец понял, кто я и куда иду' },
      { archetype: 'empath', sphere: 'bottom', label: 'Что вокруг меня — близкие и настоящие люди' },
    ],
  },
];
const sphereOrbitDots: Record<'bottom' | 'left' | 'right', KodaOrbitDot[]> = {
  left: [
    { angle: 270, size: 3.8 },
    { angle: 201, size: 2.35 },
    { angle: 184, size: 3.35 },
    { angle: 76, size: 3.55 },
  ],
  right: [
    { angle: 292, size: 3.65 },
    { angle: 176, size: 3.35 },
    { angle: 163, size: 2.35 },
    { angle: 42, size: 3.55 },
  ],
  bottom: [
    { angle: 270, size: 3.7 },
    { angle: 180, size: 3.3 },
    { angle: 0, size: 3.2 },
    { angle: 224, size: 2.25 },
    { angle: 315, size: 3.45 },
  ],
};

const flightParticles = Array.from({ length: FLIGHT_PARTICLE_COUNT }, (_, index) => {
  const along = 0.06 + (index / (FLIGHT_PARTICLE_COUNT - 1)) * 0.9;
  const spread = 2 + Math.pow(1 - along, 1.7) * 38;
  const jitter =
    Math.sin(index * 12.9898) * 43758.5453 -
    Math.floor(Math.sin(index * 12.9898) * 43758.5453);
  const side = index % 2 === 0 ? 1 : -1;
  const y = side * spread * Math.pow(jitter, 0.72);
  const size = 0.9 + ((index * 7) % 13) / 13;
  const alpha = 0.04 + Math.pow(along, 1.75) * 0.34 + ((index * 5) % 11) / 140;

  return { alpha, along, size, y };
});

const flightLetters = Array.from({ length: FLIGHT_LETTER_COUNT }, (_, index) => {
  const along = 0.1 + (index / (FLIGHT_LETTER_COUNT - 1)) * 0.82;
  const spread = 5 + Math.pow(1 - along, 1.28) * 52;
  const jitter =
    Math.sin((index + 41) * 18.193) * 18317.371 -
    Math.floor(Math.sin((index + 41) * 18.193) * 18317.371);
  const side = index % 3 === 0 ? -1 : 1;
  const y = side * spread * (0.18 + jitter * 0.82);
  const size = 7 + ((index * 5) % 9);
  const rotate = -42 + ((index * 17) % 84);
  const alpha = 0.05 + Math.pow(along, 1.55) * 0.42 + ((index * 7) % 10) / 120;
  const char = FLIGHT_LETTERS[index % FLIGHT_LETTERS.length];

  return { alpha, along, char, rotate, size, y };
});

const answerDustDots = Array.from({ length: ANSWER_DUST_DOT_COUNT }, (_, index) => {
  const rawA = Math.sin((index + 1) * 12.9898) * 43758.5453;
  const rawB = Math.sin((index + 1) * 78.233) * 24634.6345;
  const rawC = Math.sin((index + 1) * 37.719) * 12478.93;
  const randomA = rawA - Math.floor(rawA);
  const randomB = rawB - Math.floor(rawB);
  const randomC = rawC - Math.floor(rawC);
  const angle = randomA * Math.PI * 2;
  const drift = 4 + randomB * 20;

  return {
    alpha: (0.28 + randomC * 0.5).toFixed(2),
    delay: `${Math.round(randomB * 220)}ms`,
    dx: `${Math.cos(angle) * drift}px`,
    dy: `${Math.sin(angle) * drift}px`,
    left: `${4 + randomA * 92}%`,
    size: `${1 + randomC * 2.2}px`,
    top: `${8 + randomB * 84}%`,
  };
});

type Rgb = [number, number, number];

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function mixChannel(from: number, to: number, ratio: number) {
  return Math.round(from + (to - from) * ratio);
}

function mixRgb(from: Rgb, to: Rgb, ratio: number) {
  const safeRatio = clamp01(ratio);

  return `${mixChannel(from[0], to[0], safeRatio)}, ${mixChannel(from[1], to[1], safeRatio)}, ${mixChannel(
    from[2],
    to[2],
    safeRatio,
  )}`;
}

function getFlightPalette(chargeRatio: number) {
  const warmth = clamp01(chargeRatio);
  const finalHeat = clamp01((chargeRatio - 0.72) / 0.28);
  const glowAlpha = 0.3 + warmth * 0.38 + finalHeat * 0.18;
  const letterBoost = 0.72 + warmth * 0.72 + finalHeat * 0.24;
  const particleBoost = 0.78 + warmth * 0.62 + finalHeat * 0.18;
  const trailBoost = 0.76 + warmth * 0.46 + finalHeat * 0.18;

  return {
    dot: mixRgb([255, 255, 255], [255, 248, 218], finalHeat),
    glow: mixRgb([235, 235, 226], [255, 197, 86], warmth),
    head: mixRgb([248, 248, 238], [255, 243, 196], warmth),
    letterBoost: letterBoost.toFixed(2),
    mid: mixRgb([210, 210, 202], [255, 220, 134], warmth),
    particle: mixRgb([218, 218, 208], [255, 224, 146], warmth),
    particleBoost: particleBoost.toFixed(2),
    tail: mixRgb([158, 158, 152], [255, 187, 74], warmth),
    trailBoost: trailBoost.toFixed(2),
    glowAlpha: glowAlpha.toFixed(2),
  };
}

function getFlightTiming(distance: number, targetRadius: number) {
  const durationMs = Math.round(
    Math.min(FLIGHT_MAX_DURATION_MS, Math.max(FLIGHT_MIN_DURATION_MS, distance / FLIGHT_SPEED_PX_PER_MS)),
  );
  const safeDistance = Math.max(distance, 1);
  const enterTargetProgress = clamp01((safeDistance - targetRadius) / safeDistance);
  const activeMoveProgress =
    FLIGHT_MOVE_START_PROGRESS + (FLIGHT_MOVE_END_PROGRESS - FLIGHT_MOVE_START_PROGRESS) * enterTargetProgress;
  const enterTargetMs = Math.max(0, Math.round(durationMs * activeMoveProgress) - FLIGHT_REACTION_LEAD_MS);

  return { durationMs, enterTargetMs };
}

type DotFlight = {
  angle: number;
  chargeRatio: number;
  dx: number;
  dy: number;
  durationMs: number;
  enterTargetMs: number;
  id: number;
  length: number;
  startX: number;
  startY: number;
};

const emptySphereValues: Record<SphereKey, number> = {
  bottom: 0,
  left: 0,
  right: 0,
};

function getCalibratedChargeLevels(scores: Record<SphereKey, number>) {
  const maxScore = Math.max(...Object.values(scores));

  if (maxScore === 0) {
    return { ...emptySphereValues };
  }

  return {
    bottom: scores.bottom === 0 ? 0 : Math.ceil((scores.bottom / maxScore) * MAX_SPHERE_CHARGE),
    left: scores.left === 0 ? 0 : Math.ceil((scores.left / maxScore) * MAX_SPHERE_CHARGE),
    right: scores.right === 0 ? 0 : Math.ceil((scores.right / maxScore) * MAX_SPHERE_CHARGE),
  };
}

export function KodaSpherePreview() {
  const [chargeLevels, setChargeLevels] = useState<Record<SphereKey, number>>({ ...emptySphereValues });
  const [flight, setFlight] = useState<DotFlight | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<DialogueOption | null>(null);
  const [showFocusPage, setShowFocusPage] = useState(false);
  const [showAreaDetailsPage, setShowAreaDetailsPage] = useState(false);
  const [showContourPage, setShowContourPage] = useState(false);
  const [showFutureVersionPage, setShowFutureVersionPage] = useState(false);
  const [focusAreaIndex, setFocusAreaIndex] = useState(0);
  const [selectedFocusAreas, setSelectedFocusAreas] = useState<FocusAreaKey[]>([]);
  const [selectedPains, setSelectedPains] = useState<string[]>([]);
  const [selectedPriority, setSelectedPriority] = useState('');
  const [areaMeaning, setAreaMeaning] = useState('');
  const [areaDetails, setAreaDetails] = useState<AreaDetailDraft[]>([]);
  const [sphereScores, setSphereScores] = useState<Record<SphereKey, number>>({ ...emptySphereValues });
  const finalCalibrationTimerRef = useRef<number | null>(null);
  const focusPageTimerRef = useRef<number | null>(null);
  const pendingChargeLevelRef = useRef<number | null>(null);
  const pendingChargeTimerRef = useRef<number | null>(null);
  const flightCleanupTimerRef = useRef<number | null>(null);
  const nextQuestionTimerRef = useRef<number | null>(null);
  const bottomSphereRef = useRef<HTMLDivElement | null>(null);
  const leftSphereRef = useRef<HTMLDivElement | null>(null);
  const rightSphereRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      if (pendingChargeTimerRef.current !== null) {
        window.clearTimeout(pendingChargeTimerRef.current);
      }
      if (flightCleanupTimerRef.current !== null) {
        window.clearTimeout(flightCleanupTimerRef.current);
      }
      if (nextQuestionTimerRef.current !== null) {
        window.clearTimeout(nextQuestionTimerRef.current);
      }
      if (finalCalibrationTimerRef.current !== null) {
        window.clearTimeout(finalCalibrationTimerRef.current);
      }
      if (focusPageTimerRef.current !== null) {
        window.clearTimeout(focusPageTimerRef.current);
      }
    };
  }, []);

  function getSphereRef(sphere: SphereKey) {
    if (sphere === 'left') return leftSphereRef;
    if (sphere === 'right') return rightSphereRef;
    return bottomSphereRef;
  }

  function answerQuestion(option: DialogueOption, event: MouseEvent<HTMLButtonElement>) {
    if (selectedOption) {
      return;
    }

    setSelectedOption(option);

    const nextSphereScores = {
      ...sphereScores,
      [option.sphere]: sphereScores[option.sphere] + 1,
    };
    const calibratedChargeLevels = getCalibratedChargeLevels(nextSphereScores);
    const isFinalAnswer = questionIndex === dialogueQuestions.length - 1;

    setSphereScores(nextSphereScores);

    const buttonRect = event.currentTarget.getBoundingClientRect();
    const sphereRect = getSphereRef(option.sphere).current?.getBoundingClientRect();
    const baseChargeLevel = pendingChargeLevelRef.current ?? chargeLevels[option.sphere];
    const nextChargeLevel = Math.min(MAX_SPHERE_CHARGE, baseChargeLevel + 1);

    if (pendingChargeTimerRef.current !== null) {
      window.clearTimeout(pendingChargeTimerRef.current);
      pendingChargeTimerRef.current = null;
    }
    if (flightCleanupTimerRef.current !== null) {
      window.clearTimeout(flightCleanupTimerRef.current);
      flightCleanupTimerRef.current = null;
    }
    if (finalCalibrationTimerRef.current !== null) {
      window.clearTimeout(finalCalibrationTimerRef.current);
      finalCalibrationTimerRef.current = null;
    }
    pendingChargeLevelRef.current = nextChargeLevel;

    if (sphereRect) {
      const startX = buttonRect.left + buttonRect.width / 2;
      const startY = buttonRect.top + buttonRect.height / 2;
      const endX = sphereRect.left + sphereRect.width / 2;
      const endY = sphereRect.top + sphereRect.height / 2;
      const length = Math.hypot(endX - startX, endY - startY);
      const targetRadius = Math.min(sphereRect.width, sphereRect.height) * SPHERE_REACTION_RADIUS_RATIO;
      const timing = getFlightTiming(length, targetRadius);

      setFlight({
        angle: Math.atan2(endY - startY, endX - startX) * (180 / Math.PI),
        chargeRatio: nextChargeLevel / MAX_SPHERE_CHARGE,
        dx: endX - startX,
        dy: endY - startY,
        durationMs: timing.durationMs,
        enterTargetMs: timing.enterTargetMs,
        id: Date.now(),
        length,
        startX,
        startY,
      });

      pendingChargeTimerRef.current = window.setTimeout(() => {
        setChargeLevels((current) => ({ ...current, [option.sphere]: nextChargeLevel }));
        pendingChargeLevelRef.current = null;
        pendingChargeTimerRef.current = null;

        if (isFinalAnswer) {
          finalCalibrationTimerRef.current = window.setTimeout(() => {
            setChargeLevels(calibratedChargeLevels);
            finalCalibrationTimerRef.current = null;
          }, 650);
        }
      }, timing.enterTargetMs);
      flightCleanupTimerRef.current = window.setTimeout(() => {
        setFlight(null);
        flightCleanupTimerRef.current = null;
      }, timing.durationMs + 120);
    } else {
      setChargeLevels((current) => (isFinalAnswer ? calibratedChargeLevels : { ...current, [option.sphere]: nextChargeLevel }));
      pendingChargeLevelRef.current = null;
    }

    if (questionIndex < dialogueQuestions.length - 1) {
      nextQuestionTimerRef.current = window.setTimeout(() => {
        setSelectedOption(null);
        setQuestionIndex((current) => Math.min(dialogueQuestions.length - 1, current + 1));
        nextQuestionTimerRef.current = null;
      }, 1450);
    } else {
      if (focusPageTimerRef.current !== null) {
        window.clearTimeout(focusPageTimerRef.current);
      }
      focusPageTimerRef.current = window.setTimeout(() => {
        setShowFocusPage(true);
        focusPageTimerRef.current = null;
      }, 2200);
    }
  }

  function toggleFocusArea(areaId: FocusAreaKey) {
    setSelectedFocusAreas((current) => {
      if (current.includes(areaId)) {
        return current.filter((id) => id !== areaId);
      }

      if (current.length >= 3) {
        return current;
      }

      return [...current, areaId];
    });
  }

  function startAreaDetails() {
    if (selectedFocusAreas.length === 0) {
      return;
    }

    setFocusAreaIndex(0);
    setAreaDetails([]);
    resetAreaDraft();
    setShowAreaDetailsPage(true);
  }

  function togglePain(pain: string) {
    setSelectedPains((current) => (current.includes(pain) ? current.filter((item) => item !== pain) : [...current, pain]));
  }

  function resetAreaDraft() {
    setSelectedPains([]);
    setSelectedPriority('');
    setAreaMeaning('');
  }

  function saveAreaDetails() {
    const currentAreaId = selectedFocusAreas[focusAreaIndex];

    if (!currentAreaId || selectedPains.length === 0 || !selectedPriority || areaMeaning.trim().length < 4) {
      return;
    }

    const nextDetails = [
      ...areaDetails,
      {
        areaId: currentAreaId,
        meaning: areaMeaning.trim(),
        pains: selectedPains,
        priority: selectedPriority,
      },
    ];

    setAreaDetails(nextDetails);

    if (focusAreaIndex < selectedFocusAreas.length - 1) {
      setFocusAreaIndex((current) => current + 1);
      resetAreaDraft();
      return;
    }

    setShowContourPage(true);
  }

  const flightPalette = flight ? getFlightPalette(flight.chargeRatio) : null;
  const currentQuestion = dialogueQuestions[questionIndex];
  const isLastQuestion = questionIndex === dialogueQuestions.length - 1;
  const currentFocusAreaId = selectedFocusAreas[focusAreaIndex];
  const currentFocusArea = focusAreas.find((area) => area.id === currentFocusAreaId);
  const currentAreaOptions = currentFocusAreaId ? areaDetailOptions[currentFocusAreaId] : null;
  const canSaveAreaDetails = selectedPains.length > 0 && Boolean(selectedPriority) && areaMeaning.trim().length >= 4;

  return (
    <div
      className="koda-sphere-scene"
      style={{
        alignItems: 'center',
        background: '#050505',
        display: 'flex',
        height: '100vh',
        justifyContent: 'center',
        overflow: 'hidden',
        position: 'relative',
        width: '100vw',
      }}
    >
      <style>
        {`
          .koda-dialog-shell {
            inset: 0;
            pointer-events: none;
            position: absolute;
            z-index: 4;
          }

          .koda-sphere-scene {
            align-items: flex-start !important;
            box-sizing: border-box;
            padding-top: 18px;
            --koda-sphere-size: clamp(132px, 9.2vw, 158px);
          }

          .koda-scene-stage {
            height: min(760px, calc(100vh - 36px));
            overflow: hidden;
            position: relative;
            width: min(1120px, calc(100vw - 40px));
          }

          .koda-focus-page {
            align-items: center;
            animation: kodaFocusPageIn .42s ease both;
            box-sizing: border-box;
            color: #f8f8f8;
            display: flex;
            flex-direction: column;
            height: 100%;
            justify-content: center;
            padding: 34px 22px;
            position: relative;
            text-align: center;
            z-index: 7;
          }

          .koda-focus-progress {
            display: flex;
            gap: 12px;
            margin-bottom: 42px;
          }

          .koda-focus-progress span {
            background: rgba(255, 255, 255, .16);
            border-radius: 999px;
            height: 7px;
            width: 38px;
          }

          .koda-focus-progress span:last-child {
            background: #f2c86b;
            box-shadow: 0 0 18px rgba(242, 200, 107, .42);
          }

          .koda-focus-card {
            background:
              radial-gradient(circle at 50% 0%, rgba(242, 200, 107, .18), transparent 42%),
              linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.035));
            border: 1px solid rgba(255,255,255,.12);
            border-radius: 34px;
            box-shadow: 0 28px 90px rgba(0,0,0,.52), inset 0 1px 0 rgba(255,255,255,.08);
            box-sizing: border-box;
            max-width: 720px;
            padding: 34px;
            width: min(720px, 100%);
          }

          .koda-focus-eyebrow {
            color: #f2c86b;
            font-size: 12px;
            font-weight: 800;
            letter-spacing: .18em;
            margin-bottom: 14px;
            text-transform: uppercase;
          }

          .koda-focus-title {
            color: #ffffff;
            font-size: clamp(32px, 4.4vw, 54px);
            font-weight: 850;
            letter-spacing: -.055em;
            line-height: .96;
            margin: 0 auto 16px;
            max-width: 640px;
          }

          .koda-focus-subtitle {
            color: rgba(255,255,255,.66);
            font-size: 16px;
            line-height: 1.45;
            margin: 0 auto 28px;
            max-width: 560px;
          }

          .koda-focus-grid {
            display: grid;
            gap: 12px;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            margin: 0 auto 26px;
            max-width: 610px;
          }

          .koda-focus-chip {
            background: rgba(255,255,255,.06);
            border: 1px solid rgba(255,255,255,.12);
            border-radius: 22px;
            color: #fff;
            cursor: pointer;
            min-height: 74px;
            padding: 14px 16px;
            text-align: left;
            transition: transform .18s ease, border-color .18s ease, background .18s ease, box-shadow .18s ease;
          }

          .koda-focus-chip:hover {
            background: rgba(255,255,255,.09);
            transform: translateY(-1px);
          }

          .koda-focus-chip.is-selected {
            background: rgba(242, 200, 107, .16);
            border-color: rgba(242, 200, 107, .72);
            box-shadow: 0 0 28px rgba(242, 200, 107, .16);
          }

          .koda-focus-chip-title {
            display: block;
            font-size: 17px;
            font-weight: 800;
            letter-spacing: -.02em;
            margin-bottom: 5px;
          }

          .koda-focus-chip-hint {
            color: rgba(255,255,255,.55);
            display: block;
            font-size: 13px;
            line-height: 1.25;
          }

          .koda-focus-button {
            background: #f2c86b;
            border: 0;
            border-radius: 999px;
            color: #111;
            cursor: pointer;
            font-size: 16px;
            font-weight: 850;
            min-width: 250px;
            padding: 16px 22px;
            transition: opacity .18s ease, transform .18s ease;
          }

          .koda-focus-button:disabled {
            cursor: default;
            opacity: .38;
          }

          .koda-focus-button:not(:disabled):hover {
            transform: translateY(-1px);
          }

          .koda-area-card {
            max-width: 820px;
            text-align: left;
          }

          .koda-area-topline {
            align-items: center;
            display: flex;
            justify-content: space-between;
            margin-bottom: 18px;
          }

          .koda-area-counter {
            color: rgba(255,255,255,.48);
            font-size: 12px;
            font-weight: 800;
            letter-spacing: .14em;
            text-transform: uppercase;
          }

          .koda-area-orb {
            background: radial-gradient(circle at 38% 34%, #fff8d8, #f2c86b 38%, rgba(242,200,107,.18) 70%, transparent 72%);
            border-radius: 999px;
            box-shadow: 0 0 32px rgba(242, 200, 107, .38);
            height: 42px;
            width: 42px;
          }

          .koda-area-title {
            color: #fff;
            font-size: clamp(32px, 4.2vw, 52px);
            font-weight: 850;
            letter-spacing: -.055em;
            line-height: .96;
            margin: 0 0 12px;
          }

          .koda-area-subtitle {
            color: rgba(255,255,255,.62);
            font-size: 16px;
            line-height: 1.45;
            margin: 0 0 24px;
            max-width: 620px;
          }

          .koda-area-section {
            margin-top: 22px;
          }

          .koda-area-section-title {
            color: rgba(255,255,255,.82);
            font-size: 14px;
            font-weight: 850;
            letter-spacing: -.01em;
            margin-bottom: 11px;
          }

          .koda-area-chip-row {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
          }

          .koda-area-chip {
            background: rgba(255,255,255,.06);
            border: 1px solid rgba(255,255,255,.12);
            border-radius: 999px;
            color: rgba(255,255,255,.84);
            cursor: pointer;
            font-size: 14px;
            font-weight: 760;
            padding: 11px 14px;
            transition: background .18s ease, border-color .18s ease, box-shadow .18s ease, transform .18s ease;
          }

          .koda-area-chip:hover {
            background: rgba(255,255,255,.09);
            transform: translateY(-1px);
          }

          .koda-area-chip.is-selected {
            background: rgba(242, 200, 107, .16);
            border-color: rgba(242, 200, 107, .7);
            box-shadow: 0 0 22px rgba(242, 200, 107, .13);
            color: #fff6d4;
          }

          .koda-area-input {
            background: rgba(255,255,255,.065);
            border: 1px solid rgba(255,255,255,.13);
            border-radius: 22px;
            box-sizing: border-box;
            color: #fff;
            font: inherit;
            font-size: 15px;
            line-height: 1.45;
            min-height: 112px;
            outline: none;
            padding: 15px 16px;
            resize: none;
            width: 100%;
          }

          .koda-area-input::placeholder {
            color: rgba(255,255,255,.36);
          }

          .koda-area-input:focus {
            border-color: rgba(242, 200, 107, .62);
            box-shadow: 0 0 0 3px rgba(242, 200, 107, .1);
          }

          .koda-area-footer {
            align-items: center;
            display: flex;
            gap: 14px;
            justify-content: space-between;
            margin-top: 24px;
          }

          .koda-area-note {
            color: rgba(255,255,255,.42);
            font-size: 13px;
            line-height: 1.35;
          }

          .koda-contour-list {
            display: grid;
            gap: 10px;
            margin: 0 auto 26px;
            max-width: 560px;
            text-align: left;
          }

          .koda-contour-row {
            align-items: center;
            background: rgba(255,255,255,.06);
            border: 1px solid rgba(255,255,255,.1);
            border-radius: 18px;
            display: flex;
            justify-content: space-between;
            padding: 12px 14px;
          }

          .koda-contour-row span:first-child {
            color: #fff;
            font-weight: 800;
          }

          .koda-contour-row span:last-child {
            color: rgba(255,255,255,.56);
            font-size: 13px;
            text-align: right;
          }

          .koda-future-card {
            align-items: center;
            display: grid;
            gap: 28px;
            grid-template-columns: 210px minmax(0, 1fr);
            max-width: 880px;
            text-align: left;
          }

          .koda-future-orb-wrap {
            align-items: center;
            display: flex;
            justify-content: center;
          }

          .koda-future-orb {
            background:
              radial-gradient(circle at 38% 32%, #ffffff 0 8%, #fff3bd 14%, #f2c86b 34%, rgba(242, 200, 107, .42) 58%, rgba(242, 200, 107, .08) 74%, transparent 76%),
              radial-gradient(circle, rgba(255,255,255,.08), transparent 62%);
            border-radius: 999px;
            box-shadow:
              0 0 42px rgba(242, 200, 107, .46),
              0 0 110px rgba(242, 200, 107, .22),
              inset 0 0 28px rgba(255,255,255,.18);
            height: 172px;
            position: relative;
            width: 172px;
          }

          .koda-future-orb::after {
            border: 1px solid rgba(255,255,255,.18);
            border-radius: 50%;
            content: '';
            inset: -18px -28px;
            position: absolute;
            transform: rotate(-24deg);
          }

          .koda-future-title {
            color: #fff;
            font-size: clamp(34px, 4.6vw, 58px);
            font-weight: 900;
            letter-spacing: -.06em;
            line-height: .94;
            margin: 0 0 16px;
          }

          .koda-future-text {
            color: rgba(255,255,255,.66);
            font-size: 16px;
            line-height: 1.45;
            margin: 0 0 20px;
          }

          .koda-future-list {
            display: grid;
            gap: 9px;
            margin-bottom: 22px;
          }

          .koda-future-item {
            align-items: center;
            background: rgba(255,255,255,.06);
            border: 1px solid rgba(255,255,255,.1);
            border-radius: 16px;
            color: rgba(255,255,255,.86);
            display: flex;
            gap: 10px;
            padding: 11px 13px;
          }

          .koda-future-dot {
            background: #f2c86b;
            border-radius: 999px;
            box-shadow: 0 0 14px rgba(242, 200, 107, .5);
            flex: 0 0 auto;
            height: 8px;
            width: 8px;
          }

          .koda-future-quest {
            background: rgba(242, 200, 107, .12);
            border: 1px solid rgba(242, 200, 107, .28);
            border-radius: 22px;
            color: #fff7d8;
            font-size: 15px;
            line-height: 1.4;
            margin-bottom: 24px;
            padding: 14px 16px;
          }

          .koda-future-quest strong {
            color: #f2c86b;
            display: block;
            font-size: 12px;
            letter-spacing: .12em;
            margin-bottom: 6px;
            text-transform: uppercase;
          }

          @keyframes kodaFocusPageIn {
            from {
              opacity: 0;
              transform: translateY(18px) scale(.985);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }

          .koda-dialog-progress {
            display: flex;
            gap: 12px;
            left: 50%;
            position: absolute;
            top: 32px;
            transform: translateX(-50%);
          }

          .koda-dialog-step {
            background: rgba(255, 255, 255, .16);
            border-radius: 999px;
            box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
            height: 7px;
            width: 38px;
          }

          .koda-dialog-step.is-active {
            background: #ffffff;
            box-shadow:
              0 0 10px rgba(255,255,255,.44),
              inset 0 1px 0 rgba(255,255,255,.65);
          }

          .koda-dialog-header {
            left: 56px;
            position: absolute;
            top: 98px;
          }

          .koda-dialog-eyebrow {
            color: #ff5a0a;
            font: 700 18px/1.05 Inter, system-ui, sans-serif;
            letter-spacing: .02em;
            margin-bottom: 16px;
            text-transform: uppercase;
          }

          .koda-dialog-title {
            color: #f5f5f2;
            font: 750 34px/1.08 Inter, system-ui, sans-serif;
            letter-spacing: 0;
          }

          .koda-dialog-theme {
            align-items: center;
            background: rgba(255,255,255,.02);
            border: 1px solid rgba(255,255,255,.2);
            border-radius: 999px;
            color: #fff;
            display: flex;
            font: 400 22px/1 Inter, system-ui, sans-serif;
            height: 58px;
            justify-content: center;
            pointer-events: auto;
            position: absolute;
            right: 56px;
            top: 72px;
            width: 58px;
          }

          .koda-dialog-thread {
            left: 56px;
            pointer-events: none;
            position: absolute;
            top: 232px;
            transform: none;
            width: calc(100% - 112px);
          }

          .speech-bubble {
            background: transparent;
            border: 0;
            display: block;
            letter-spacing: 0;
            position: relative;
          }

          .speech-bubble-shape {
            bottom: 0;
            filter:
              drop-shadow(0 18px 26px rgba(0,0,0,.32))
              drop-shadow(0 1px 0 rgba(255,255,255,.03));
            height: 100%;
            left: 0;
            overflow: visible;
            pointer-events: none;
            position: absolute;
            width: 100%;
            z-index: 0;
          }

          .speech-bubble-stroke {
            stroke: rgba(255,255,255,.1);
            stroke-width: .55;
            vector-effect: non-scaling-stroke;
          }

          .speech-bubble--answer .speech-bubble-stroke {
            stroke: rgba(255,255,255,.78);
          }

          .speech-bubble--answer {
            background: transparent;
          }

          .speech-bubble--answer .speech-bubble-shape {
            filter:
              drop-shadow(0 18px 26px rgba(0,0,0,.32))
              drop-shadow(0 1px 0 rgba(255,255,255,.18));
          }

          .speech-bubble-content {
            display: block;
            position: relative;
            z-index: 2;
          }

          .koda-dialog-bubble {
            backdrop-filter: blur(10px);
            letter-spacing: 0;
            position: relative;
          }

          .koda-dialog-bubble--koda {
            color: #f8f8f5;
            font: 400 22px/1.46 Inter, system-ui, sans-serif;
            max-width: 520px;
            overflow: visible;
            padding: 11px 16px 22px 22px;
          }

          .koda-dialog-thread.has-selection .koda-dialog-bubble--koda {
            animation: kodaQuestionFadeAway 1280ms cubic-bezier(.2, 0, .18, 1) both;
          }

          .koda-dialog-options {
            align-items: flex-end;
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-top: 46px;
            pointer-events: auto;
          }

          .koda-dialog-answer {
            box-sizing: border-box;
            color: #111111;
            cursor: pointer;
            font: 400 20px/1.32 Inter, system-ui, sans-serif;
            height: 86px;
            isolation: isolate;
            max-width: 410px;
            padding: 11px 16px 22px;
            pointer-events: auto;
            position: relative;
            text-align: left;
            width: min(410px, 100%);
            transition:
              transform 180ms ease,
              filter 180ms ease,
              opacity 180ms ease;
          }

          .koda-dialog-answer:hover {
            filter: drop-shadow(0 14px 20px rgba(0,0,0,.16));
            transform: translateY(-1px);
          }

          .koda-dialog-answer:disabled {
            cursor: default;
          }

          .koda-dialog-answer-label {
            display: block;
            position: relative;
            z-index: 2;
          }

          .koda-dialog-answer.is-dispersing {
            animation: kodaAnswerBubbleDisperse 1360ms cubic-bezier(.18, 0, .18, 1) both;
          }

          .koda-dialog-answer.is-dispersing:hover {
            transform: none;
          }

          .koda-dialog-answer.is-dispersing .koda-dialog-answer-label {
            animation: kodaAnswerLabelDisperse 1120ms cubic-bezier(.2, 0, .18, 1) both;
          }

          .koda-dialog-answer.is-fading {
            animation: kodaAnswerFadeAway 1280ms cubic-bezier(.2, 0, .18, 1) both;
          }

          .koda-dialog-answer.is-fading:hover {
            transform: none;
          }

          .koda-dialog-answer.is-fading .koda-dialog-answer-label {
            animation: kodaAnswerLabelFadeAway 1120ms cubic-bezier(.2, 0, .18, 1) both;
          }

          .koda-answer-dust-layer {
            border-radius: inherit;
            inset: 0;
            overflow: hidden;
            pointer-events: none;
            position: absolute;
            z-index: 3;
          }

          .koda-answer-dust-dot {
            animation: kodaAnswerDustDot 1180ms cubic-bezier(.16, 0, .22, 1) both;
            animation-delay: var(--d-delay);
            background: rgba(24, 24, 22, var(--d-alpha));
            border-radius: 50%;
            box-shadow:
              0 0 4px rgba(255, 215, 148, calc(var(--d-alpha) * .45)),
              0 0 9px rgba(255, 255, 255, calc(var(--d-alpha) * .18));
            height: var(--d-size);
            left: var(--d-left);
            position: absolute;
            top: var(--d-top);
            transform: translate(-50%, -50%) scale(.3);
            width: var(--d-size);
          }

          @keyframes kodaAnswerBubbleDisperse {
            0% {
              filter: blur(0);
              opacity: 1;
            }
            45% {
              filter: blur(.4px);
              opacity: .96;
            }
            78% {
              filter: blur(1.4px);
              opacity: .5;
            }
            100% {
              filter: blur(2.8px);
              opacity: 0;
            }
          }

          @keyframes kodaAnswerLabelDisperse {
            0% {
              filter: blur(0);
              opacity: 1;
            }
            34% {
              filter: blur(.9px);
              opacity: .62;
            }
            100% {
              filter: blur(5px);
              opacity: 0;
            }
          }

          @keyframes kodaAnswerFadeAway {
            0% {
              filter: blur(0);
              opacity: 1;
            }
            42% {
              filter: blur(.6px);
              opacity: .82;
            }
            100% {
              filter: blur(4px);
              opacity: 0;
            }
          }

          @keyframes kodaAnswerLabelFadeAway {
            0% {
              filter: blur(0);
              opacity: 1;
            }
            48% {
              filter: blur(1.2px);
              opacity: .56;
            }
            100% {
              filter: blur(5.5px);
              opacity: 0;
            }
          }

          @keyframes kodaAnswerDustDot {
            0% {
              opacity: 0;
              transform: translate(-50%, -50%) scale(.2);
            }
            16% {
              opacity: calc(var(--d-alpha) * .92);
              transform: translate(-50%, -50%) scale(1);
            }
            58% {
              opacity: calc(var(--d-alpha) * .72);
            }
            100% {
              opacity: 0;
              transform:
                translate(
                  calc(-50% + var(--d-dx)),
                  calc(-50% + var(--d-dy))
                )
                scale(.18);
            }
          }

          @keyframes kodaQuestionFadeAway {
            0% {
              filter: blur(0);
              opacity: 1;
            }
            45% {
              filter: blur(.7px);
              opacity: .82;
            }
            100% {
              filter: blur(4.6px);
              opacity: 0;
            }
          }

          @keyframes kodaQuestionTailFadeAway {
            0% {
              filter: blur(0);
              opacity: 1;
            }
            100% {
              filter: blur(3.2px);
              opacity: 0;
            }
          }

          .koda-dialog-complete {
            color: rgba(255,255,255,.72);
            font: 400 15px/1.45 Inter, system-ui, sans-serif;
            margin-top: 14px;
            max-width: 420px;
          }

          .preview-flight-layer {
            height: 0;
            left: 0;
            pointer-events: none;
            position: fixed;
            top: 0;
            transform: translate(-50%, -50%);
            width: 0;
            z-index: 5;
          }

          .koda-sphere-links {
            height: 100%;
            inset: 0;
            overflow: visible;
            pointer-events: none;
            position: absolute;
            width: 100%;
            z-index: 0;
          }

          .koda-sphere-links--mobile {
            display: none;
          }

          .koda-sphere-link {
            stroke: rgba(230, 235, 240, .22);
            stroke-linecap: round;
            stroke-width: 1;
            vector-effect: non-scaling-stroke;
          }

          .koda-link-runner {
            animation: kodaLinkRunner 53.3s linear infinite;
            background: #ffffff;
            border-radius: 999px;
            box-shadow:
              0 0 7px rgba(255, 255, 255, .82),
              0 0 16px rgba(255, 255, 255, .22);
            height: 5px;
            left: 15%;
            pointer-events: none;
            position: absolute;
            top: 60%;
            transform: translate(-50%, -50%);
            width: 5px;
            z-index: 0;
          }

          .koda-sphere-node {
            height: var(--koda-sphere-size, 170px);
            position: absolute;
            transform: translate(-50%, -50%);
            width: var(--koda-sphere-size, 170px);
            z-index: 1;
          }

          .koda-sphere-node--left {
            left: 15%;
            top: 60%;
          }

          .koda-sphere-node--right {
            left: 80%;
            top: 34%;
          }

          .koda-sphere-node--bottom {
            left: 43%;
            top: 78%;
          }

          @media (max-width: 760px) {
            .koda-sphere-scene {
              align-items: center !important;
              padding-top: 0;
              --koda-sphere-size: clamp(108px, 30vw, 132px);
            }

            .koda-scene-stage {
              height: 100vh;
              width: 100vw;
            }

            .koda-focus-page {
              justify-content: flex-start;
              overflow-y: auto;
              padding: 38px 16px 22px;
            }

            .koda-focus-progress {
              gap: 9px;
              margin-bottom: 28px;
            }

            .koda-focus-progress span {
              height: 5px;
              width: 31px;
            }

            .koda-focus-card {
              border-radius: 28px;
              padding: 24px 18px;
            }

            .koda-focus-title {
              font-size: 34px;
            }

            .koda-focus-subtitle {
              font-size: 14px;
              margin-bottom: 20px;
            }

            .koda-focus-grid {
              grid-template-columns: 1fr;
              gap: 9px;
              margin-bottom: 20px;
            }

            .koda-focus-chip {
              min-height: 64px;
              padding: 12px 14px;
            }

            .koda-focus-button {
              min-width: 0;
              width: 100%;
            }

            .koda-area-card {
              max-width: none;
              text-align: left;
            }

            .koda-area-title {
              font-size: 33px;
            }

            .koda-area-subtitle {
              font-size: 14px;
              margin-bottom: 18px;
            }

            .koda-area-section {
              margin-top: 18px;
            }

            .koda-area-chip-row {
              gap: 8px;
            }

            .koda-area-chip {
              font-size: 13px;
              padding: 10px 12px;
            }

            .koda-area-footer {
              align-items: stretch;
              flex-direction: column;
            }

            .koda-area-note {
              order: 2;
              text-align: center;
            }

            .koda-future-card {
              display: block;
              text-align: center;
            }

            .koda-future-orb-wrap {
              margin-bottom: 22px;
            }

            .koda-future-orb {
              height: 138px;
              width: 138px;
            }

            .koda-future-title {
              font-size: 34px;
            }

            .koda-future-text {
              font-size: 14px;
            }

            .koda-future-item {
              text-align: left;
            }

            .koda-dialog-progress {
              gap: 9px;
              top: 8px;
            }

            .koda-dialog-step {
              height: 5px;
              width: 31px;
            }

            .koda-dialog-header {
              left: 20px;
              top: 46px;
            }

            .koda-dialog-eyebrow {
              font-size: 13px;
              margin-bottom: 12px;
            }

            .koda-dialog-title {
              font-size: 22px;
            }

            .koda-dialog-theme {
              font-size: 18px;
              height: 42px;
              right: 18px;
              top: 18px;
              width: 42px;
            }

            .koda-dialog-thread {
              left: 50%;
              top: 140px;
              transform: translateX(-50%);
              width: calc(100vw - 40px);
            }

            .koda-dialog-bubble--koda {
              font-size: 16px;
              line-height: 1.48;
              max-width: 310px;
              padding: 10px 16px 21px 22px;
            }

            .koda-dialog-options {
              gap: 8px;
              margin-top: 26px;
            }

            .koda-dialog-answer {
              font-size: 15px;
              height: 76px;
              max-width: 270px;
              padding: 10px 16px 21px;
              width: min(270px, 100%);
            }

            .koda-dialog-complete {
              font-size: 13px;
              max-width: 300px;
            }

            .koda-sphere-links--desktop {
              display: none;
            }

            .koda-sphere-links--mobile {
              display: block;
            }

            .koda-link-runner {
              animation-name: kodaLinkRunnerMobile;
            }

            .koda-sphere-node {
              transform: translate(-50%, -50%);
            }

            .koda-sphere-node--left {
              left: 28%;
              top: 38%;
            }

            .koda-sphere-node--right {
              left: 78%;
              top: 16%;
            }

            .koda-sphere-node--bottom {
              left: 60%;
              top: 62%;
            }
          }

          @keyframes kodaLinkRunner {
            0%, 100% {
              left: 20%;
              top: 47%;
            }
            11% {
              left: 35%;
              top: 64%;
            }
            23% {
              left: 34%;
              top: 82%;
            }
            29% {
              left: 52%;
              top: 66%;
            }
            48% {
              left: 80%;
              top: 37%;
            }
            61% {
              left: 65%;
              top: 59%;
            }
            74% {
              left: 34%;
              top: 82%;
            }
            82% {
              left: 27%;
              top: 65%;
            }
          }

          @keyframes kodaLinkRunnerMobile {
            0%, 100% {
              left: 28%;
              top: 38%;
            }
            11% {
              left: 39%;
              top: 49%;
            }
            23% {
              left: 50%;
              top: 62%;
            }
            29% {
              left: 66%;
              top: 36%;
            }
            48% {
              left: 78%;
              top: 16%;
            }
            61% {
              left: 69%;
              top: 35%;
            }
            74% {
              left: 60%;
              top: 62%;
            }
            82% {
              left: 45%;
              top: 48%;
            }
          }

          .preview-flight-trail,
          .preview-flight-letters,
          .preview-flight-particles,
          .preview-flying-dot {
            left: 0;
            pointer-events: none;
            position: absolute;
            top: 0;
          }

          .preview-flight-trail {
            animation: kodaPreviewFlightTrail var(--flight-duration) cubic-bezier(.2,0,.18,1) both;
            height: 1px;
            opacity: 0;
            overflow: visible;
            transform-origin: 0 50%;
            width: var(--trail-length);
          }

          .preview-flight-trail::before {
            background: linear-gradient(
              90deg,
              rgba(var(--flight-tail-rgb), calc(.08 * var(--flight-trail-boost))) 0%,
              rgba(var(--flight-mid-rgb), calc(.16 * var(--flight-trail-boost))) 58%,
              rgba(var(--flight-head-rgb), calc(.52 * var(--flight-trail-boost))) 84%,
              rgba(var(--flight-dot-rgb), calc(.88 * var(--flight-trail-boost))) 100%
            );
            border-radius: 999px;
            box-shadow:
              0 0 5px rgba(var(--flight-glow-rgb), calc(.12 * var(--flight-trail-boost))),
              0 0 11px rgba(var(--flight-glow-rgb), calc(.05 * var(--flight-trail-boost)));
            content: '';
            display: block;
            height: 100%;
            opacity: .76;
            width: 100%;
          }

          .preview-flight-trail::after {
            background: linear-gradient(
              90deg,
              transparent 0%,
              rgba(var(--flight-tail-rgb), calc(.04 * var(--flight-trail-boost))) 62%,
              rgba(var(--flight-head-rgb), calc(.32 * var(--flight-trail-boost))) 90%,
              rgba(var(--flight-dot-rgb), calc(.7 * var(--flight-trail-boost))) 100%
            );
            border-radius: 999px;
            box-shadow:
              0 0 8px rgba(var(--flight-head-rgb), calc(.2 * var(--flight-trail-boost))),
              0 0 18px rgba(var(--flight-glow-rgb), calc(.1 * var(--flight-trail-boost)));
            content: '';
            display: block;
            filter: blur(.9px);
            height: 3px;
            left: 0;
            position: absolute;
            top: -1px;
            width: 100%;
          }

          .preview-flight-particles {
            animation: kodaPreviewFlightParticles var(--flight-duration) cubic-bezier(.2,0,.18,1) both;
            height: 96px;
            opacity: 0;
            overflow: visible;
            top: -48px;
            transform-origin: 0 50%;
            width: var(--trail-length);
          }

          .preview-flight-particle {
            background: rgba(var(--flight-particle-rgb), calc(var(--p-alpha) * var(--flight-particle-boost)));
            border-radius: 999px;
            box-shadow:
              0 0 5px rgba(var(--flight-head-rgb), calc(var(--p-alpha) * .55 * var(--flight-particle-boost))),
              0 0 11px rgba(var(--flight-glow-rgb), calc(var(--p-alpha) * .22 * var(--flight-particle-boost)));
            height: var(--p-size);
            left: var(--p-left);
            opacity: .9;
            position: absolute;
            top: calc(50% + var(--p-y));
            transform: translate(-50%, -50%);
            width: var(--p-size);
          }

          .preview-flight-letters {
            animation: kodaPreviewFlightLetters var(--flight-duration) cubic-bezier(.2,0,.18,1) both;
            font-family: Inter, system-ui, sans-serif;
            font-weight: 500;
            height: 126px;
            opacity: 0;
            overflow: visible;
            text-shadow:
              0 0 5px rgba(var(--flight-head-rgb), .2),
              0 0 12px rgba(var(--flight-glow-rgb), .12);
            top: -63px;
            transform-origin: 0 50%;
            width: var(--trail-length);
          }

          .preview-flight-letter {
            color: rgba(var(--flight-head-rgb), calc(var(--l-alpha) * var(--flight-letter-boost)));
            font-size: var(--l-size);
            left: var(--l-left);
            line-height: 1;
            opacity: .9;
            position: absolute;
            text-shadow:
              0 0 5px rgba(var(--flight-head-rgb), calc(var(--l-alpha) * var(--flight-letter-boost) * .42)),
              0 0 12px rgba(var(--flight-glow-rgb), calc(var(--l-alpha) * var(--flight-letter-boost) * .22));
            top: calc(50% + var(--l-y));
            transform: translate(-50%, -50%) rotate(var(--l-rotate));
            user-select: none;
          }

          .preview-flying-dot {
            animation: kodaPreviewFlyingDot var(--flight-duration) cubic-bezier(.2,0,.18,1) both;
            background: radial-gradient(circle, rgb(var(--flight-dot-rgb)) 0 36%, rgb(var(--flight-head-rgb)) 72%, rgba(var(--flight-particle-rgb), .84) 100%);
            border-radius: 999px;
            box-shadow:
              0 0 8px rgba(var(--flight-dot-rgb), .92),
              0 0 16px rgba(var(--flight-glow-rgb), var(--flight-glow-alpha)),
              0 0 28px rgba(var(--flight-glow-rgb), calc(var(--flight-glow-alpha) * .42));
            height: 5px;
            transform: translate(-50%, -50%);
            width: 5px;
            will-change: transform, opacity;
          }

          @keyframes kodaPreviewFlyingDot {
            0% {
              opacity: 0;
              transform: translate(-50%, -50%) translate(0, 0) scale(.72);
            }
            4% {
              opacity: 1;
              transform: translate(-50%, -50%) translate(0, 0) scale(.82);
            }
            16% {
              opacity: 1;
              transform: translate(-50%, -50%) translate(0, 0) scale(.82);
            }
            92% {
              opacity: 1;
              transform: translate(-50%, -50%) translate(var(--dot-dx), var(--dot-dy)) scale(1);
            }
            100% {
              opacity: 0;
              transform: translate(-50%, -50%) translate(var(--dot-dx), var(--dot-dy)) scale(.35);
            }
          }

          @keyframes kodaPreviewFlightTrail {
            0%, 16% {
              opacity: 0;
              transform:
                translateY(-.5px)
                rotate(var(--trail-angle))
                scaleX(0);
            }
            24% {
              opacity: .42;
            }
            92% {
              opacity: .5;
              transform:
                translateY(-.5px)
                rotate(var(--trail-angle))
                scaleX(1);
            }
            100% {
              opacity: 0;
              transform:
                translateY(-.5px)
                rotate(var(--trail-angle))
                scaleX(1);
            }
          }

          @keyframes kodaPreviewFlightParticles {
            0%, 16% {
              opacity: 0;
              transform:
                rotate(var(--trail-angle))
                scaleX(0);
            }
            26% {
              opacity: .42;
            }
            92% {
              opacity: .58;
              transform:
                rotate(var(--trail-angle))
                scaleX(1);
            }
            100% {
              opacity: 0;
              transform:
                rotate(var(--trail-angle))
                scaleX(1);
            }
          }

          @keyframes kodaPreviewFlightLetters {
            0%, 18% {
              opacity: 0;
              transform:
                rotate(var(--trail-angle))
                scaleX(0);
            }
            34% {
              opacity: .38;
            }
            92% {
              opacity: .5;
              transform:
                rotate(var(--trail-angle))
                scaleX(1);
            }
            100% {
              opacity: 0;
              transform:
                rotate(var(--trail-angle))
                scaleX(1);
            }
          }

        `}
      </style>
      <div className="koda-scene-stage">
      {showFutureVersionPage ? (
        <div className="koda-focus-page">
          <div className="koda-focus-progress" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="koda-focus-card koda-future-card">
            <div className="koda-future-orb-wrap">
              <div className="koda-future-orb" aria-hidden="true" />
            </div>
            <div>
              <div className="koda-focus-eyebrow">Будущая версия</div>
              <h1 className="koda-future-title">Ты, но собраннее и спокойнее</h1>
              <p className="koda-future-text">
                Первый контур готов: KODA видит, какие сферы забирают энергию, где нужен порядок и с чего начать без перегруза.
              </p>
              <div className="koda-future-list">
                {areaDetails.map((detail) => {
                  const area = focusAreas.find((item) => item.id === detail.areaId);

                  return (
                    <div key={detail.areaId} className="koda-future-item">
                      <span className="koda-future-dot" />
                      <span>
                        {area?.label}: {detail.priority.toLowerCase()}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="koda-future-quest">
                <strong>Первый квест</strong>
                Выбери самый лёгкий 15-минутный шаг по первой сфере и сделай его сегодня — без героизма, просто чтобы включить движение.
              </div>
              <button className="koda-focus-button" type="button">
                Открыть первый квест
              </button>
            </div>
          </div>
        </div>
      ) : showContourPage ? (
        <div className="koda-focus-page">
          <div className="koda-focus-progress" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="koda-focus-card">
            <div className="koda-focus-eyebrow">Контур собран</div>
            <h1 className="koda-focus-title">KODA видит первые точки роста</h1>
            <p className="koda-focus-subtitle">
              Сферы, боли и приоритеты уже собраны. Следующим шагом из этого можно собрать будущую версию и первые квесты.
            </p>
            <div className="koda-contour-list">
              {areaDetails.map((detail) => {
                const area = focusAreas.find((item) => item.id === detail.areaId);

                return (
                  <div key={detail.areaId} className="koda-contour-row">
                    <span>{area?.label}</span>
                    <span>{detail.priority}</span>
                  </div>
                );
              })}
            </div>
            <button className="koda-focus-button" onClick={() => setShowFutureVersionPage(true)} type="button">
              Создать будущую версию
            </button>
          </div>
        </div>
      ) : showAreaDetailsPage && currentFocusArea && currentAreaOptions ? (
        <div className="koda-focus-page">
          <div className="koda-focus-progress" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="koda-focus-card koda-area-card">
            <div className="koda-area-topline">
              <div>
                <div className="koda-focus-eyebrow">Разбор сферы</div>
                <div className="koda-area-counter">
                  Сфера {focusAreaIndex + 1} / {selectedFocusAreas.length}
                </div>
              </div>
              <div className="koda-area-orb" aria-hidden="true" />
            </div>
            <h1 className="koda-area-title">{currentFocusArea.label}</h1>
            <p className="koda-area-subtitle">
              Что здесь сильнее всего тянет энергию? Выбери несколько болей, потом один главный приоритет.
            </p>

            <div className="koda-area-section">
              <div className="koda-area-section-title">Что сейчас болит?</div>
              <div className="koda-area-chip-row">
                {currentAreaOptions.pains.map((pain) => (
                  <button
                    key={pain}
                    className={`koda-area-chip${selectedPains.includes(pain) ? ' is-selected' : ''}`}
                    onClick={() => togglePain(pain)}
                    type="button"
                  >
                    {pain}
                  </button>
                ))}
              </div>
            </div>

            <div className="koda-area-section">
              <div className="koda-area-section-title">Если решить только одно — что даст больше всего свободы?</div>
              <div className="koda-area-chip-row">
                {currentAreaOptions.priorities.map((priority) => (
                  <button
                    key={priority}
                    className={`koda-area-chip${selectedPriority === priority ? ' is-selected' : ''}`}
                    onClick={() => setSelectedPriority(priority)}
                    type="button"
                  >
                    {priority}
                  </button>
                ))}
              </div>
            </div>

            <div className="koda-area-section">
              <div className="koda-area-section-title">Коротко своими словами</div>
              <textarea
                className="koda-area-input"
                onChange={(event) => setAreaMeaning(event.currentTarget.value)}
                placeholder={currentAreaOptions.placeholder}
                value={areaMeaning}
              />
            </div>

            <div className="koda-area-footer">
              <div className="koda-area-note">Это не анкета ради анкеты. Эти данные нужны, чтобы KODA не придумывал квесты в пустоту.</div>
              <button className="koda-focus-button" disabled={!canSaveAreaDetails} onClick={saveAreaDetails} type="button">
                {focusAreaIndex < selectedFocusAreas.length - 1 ? 'Следующая сфера' : 'Собрать контур'}
              </button>
            </div>
          </div>
        </div>
      ) : showFocusPage ? (
        <div className="koda-focus-page">
          <div className="koda-focus-progress" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="koda-focus-card">
            <div className="koda-focus-eyebrow">Фокус</div>
            <h1 className="koda-focus-title">Какие сферы жизни сейчас важнее всего?</h1>
            <p className="koda-focus-subtitle">
              Выбери от одной до трёх. Они станут атрибутами, которые KODA будет прокачивать через маленькие квесты.
            </p>
            <div className="koda-focus-grid">
              {focusAreas.map((area) => {
                const isSelected = selectedFocusAreas.includes(area.id);

                return (
                  <button
                    key={area.id}
                    className={`koda-focus-chip${isSelected ? ' is-selected' : ''}`}
                    onClick={() => toggleFocusArea(area.id)}
                    type="button"
                  >
                    <span className="koda-focus-chip-title">{area.label}</span>
                    <span className="koda-focus-chip-hint">{area.hint}</span>
                  </button>
                );
              })}
            </div>
            <button className="koda-focus-button" disabled={selectedFocusAreas.length === 0} onClick={startAreaDetails} type="button">
              Создать будущую версию
            </button>
          </div>
        </div>
      ) : (
      <>
      <div className="koda-dialog-shell">
        <div className="koda-dialog-progress" aria-hidden="true">
          {dialogueQuestions.map((_, index) => (
            <span key={index} className={`koda-dialog-step${index === questionIndex ? ' is-active' : ''}`} />
          ))}
        </div>
        <button aria-label="Переключить тему" className="koda-dialog-theme" type="button">
          ☼
        </button>
        <div className="koda-dialog-header">
          <div className="koda-dialog-eyebrow">
            {currentQuestion.eyebrow} · {questionIndex + 1} / {dialogueQuestions.length}
          </div>
          <div className="koda-dialog-title">{currentQuestion.title}</div>
        </div>
        <div className={`koda-dialog-thread${selectedOption ? ' has-selection' : ''}`}>
          <SpeechBubble className="koda-dialog-bubble koda-dialog-bubble--koda" tail="left" variant="koda">
            {currentQuestion.prompt}
          </SpeechBubble>
          <div className="koda-dialog-options">
            {currentQuestion.options.map((option) => {
              const isSelected = selectedOption?.label === option.label;
              const isFading = Boolean(selectedOption) && !isSelected;

              return (
                <SpeechBubble
                  as="button"
                  key={option.label}
                  className={`koda-dialog-answer${isSelected ? ' is-dispersing' : ''}${isFading ? ' is-fading' : ''}`}
                  disabled={Boolean(selectedOption)}
                  onClick={(event) => answerQuestion(option, event)}
                  tail="right"
                  type="button"
                  variant="answer"
                >
                  <span className="koda-dialog-answer-label">{option.label}</span>
                  {isSelected ? (
                    <span aria-hidden="true" className="koda-answer-dust-layer">
                      {answerDustDots.map((dot, index) => (
                        <span
                          key={index}
                          className="koda-answer-dust-dot"
                          style={
                            {
                              '--d-alpha': dot.alpha,
                              '--d-delay': dot.delay,
                              '--d-dx': dot.dx,
                              '--d-dy': dot.dy,
                              '--d-left': dot.left,
                              '--d-size': dot.size,
                              '--d-top': dot.top,
                            } as CSSProperties
                          }
                        />
                      ))}
                    </span>
                  ) : null}
                </SpeechBubble>
              );
            })}
            {selectedOption && isLastQuestion ? (
              <div className="koda-dialog-complete">Собираю первый контур твоего профиля...</div>
            ) : null}
          </div>
        </div>
      </div>
      <svg aria-hidden="true" className="koda-sphere-links koda-sphere-links--desktop">
        <line className="koda-sphere-link" x1="15%" y1="60%" x2="43%" y2="78%" />
        <line className="koda-sphere-link" x1="80%" y1="34%" x2="43%" y2="78%" />
      </svg>
      <svg aria-hidden="true" className="koda-sphere-links koda-sphere-links--mobile">
        <line className="koda-sphere-link" x1="28%" y1="38%" x2="60%" y2="62%" />
        <line className="koda-sphere-link" x1="78%" y1="16%" x2="60%" y2="62%" />
      </svg>
      <span aria-hidden="true" className="koda-link-runner" />
      {flight ? (
        <span
          key={flight.id}
          className="preview-flight-layer"
          style={
            {
              '--dot-dx': `${flight.dx}px`,
              '--dot-dy': `${flight.dy}px`,
              '--flight-duration': `${flight.durationMs}ms`,
              '--flight-dot-rgb': flightPalette?.dot,
              '--flight-glow-rgb': flightPalette?.glow,
              '--flight-head-rgb': flightPalette?.head,
              '--flight-glow-alpha': flightPalette?.glowAlpha,
              '--flight-letter-boost': flightPalette?.letterBoost,
              '--flight-mid-rgb': flightPalette?.mid,
              '--flight-particle-boost': flightPalette?.particleBoost,
              '--flight-particle-rgb': flightPalette?.particle,
              '--flight-tail-rgb': flightPalette?.tail,
              '--flight-trail-boost': flightPalette?.trailBoost,
              '--trail-angle': `${flight.angle}deg`,
              '--trail-length': `${flight.length}px`,
              left: flight.startX,
              top: flight.startY,
            } as CSSProperties
          }
        >
          <span className="preview-flight-trail" />
          <span className="preview-flight-particles">
            {flightParticles.map((particle, index) => (
              <span
                key={index}
                className="preview-flight-particle"
                style={
                  {
                    '--p-alpha': particle.alpha,
                    '--p-left': `${particle.along * 100}%`,
                    '--p-size': `${particle.size}px`,
                    '--p-y': `${particle.y}px`,
                  } as CSSProperties
                }
              />
            ))}
          </span>
          <span className="preview-flight-letters">
            {flightLetters.map((letter, index) => (
              <span
                key={index}
                className="preview-flight-letter"
                style={
                  {
                    '--l-alpha': letter.alpha,
                    '--l-left': `${letter.along * 100}%`,
                    '--l-rotate': `${letter.rotate}deg`,
                    '--l-size': `${letter.size}px`,
                    '--l-y': `${letter.y}px`,
                  } as CSSProperties
                }
              >
                {letter.char}
              </span>
            ))}
          </span>
          <span className="preview-flying-dot" />
        </span>
      ) : null}
      <div ref={leftSphereRef} className="koda-sphere-node koda-sphere-node--left">
        <KodaSphere
          chargeLevel={chargeLevels.left}
          maxCharge={MAX_SPHERE_CHARGE}
          orbitDots={sphereOrbitDots.left}
          size={220}
          style={{ height: '100%', width: '100%' }}
        />
      </div>
      <div ref={rightSphereRef} className="koda-sphere-node koda-sphere-node--right">
        <KodaSphere
          chargeLevel={chargeLevels.right}
          maxCharge={MAX_SPHERE_CHARGE}
          orbitDots={sphereOrbitDots.right}
          size={220}
          style={{ height: '100%', width: '100%' }}
        />
      </div>
      <div ref={bottomSphereRef} className="koda-sphere-node koda-sphere-node--bottom">
        <KodaSphere
          chargeLevel={chargeLevels.bottom}
          maxCharge={MAX_SPHERE_CHARGE}
          orbitDots={sphereOrbitDots.bottom}
          size={220}
          style={{ height: '100%', width: '100%' }}
        />
      </div>
      </>
      )}
      </div>
    </div>
  );
}

