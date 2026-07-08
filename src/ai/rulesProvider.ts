import type { AiProvider, Answer, KodaAiInput, KodaPlan, Question } from '../types/koda';

export const firstQuestion: Question = {
  eyebrow: 'Точка А',
  question: 'Что сейчас больше всего мешает двигаться?',
  placeholder: 'Долги, хаос, усталость, расфокус, работа не растёт...',
  rationale: 'Начинаем с текущего напряжения: оно показывает, откуда нужна энергия изменений.',
};

const questionFlow: Question[] = [
  firstQuestion,
  {
    eyebrow: 'Версия себя',
    question: 'Каким человеком ты хочешь быть через 3 года?',
    placeholder: 'Спокойный, собранный, уверенный, свободный, в форме...',
    rationale: 'Формируем образ будущей идентичности, а не только список задач.',
  },
  {
    eyebrow: 'Срыв планов',
    question: 'Где обычно ломается выполнение: старт, регулярность, страх ошибки или перегруз?',
    placeholder: 'Начинаю резко и бросаю, боюсь сделать плохо, забываю...',
    rationale: 'Это помогает выбрать механику шага: микро-старт, ритм, поддержку или снижение страха.',
  },
  {
    eyebrow: 'Карьера и деньги',
    question: 'Какая работа, доход или роль будут для тебя ощутимой победой?',
    placeholder: 'Data Analyst Middle, 300 000 ₽, без долгов, подушка...',
    rationale: 'Переводим желание в измеримое направление.',
  },
  {
    eyebrow: 'Энергия',
    question: 'Что должно измениться в теле, сне или привычках, чтобы путь стал реальным?',
    placeholder: 'Вес, сон, спорт, питание, меньше выгорания...',
    rationale: 'Без энергии даже правильные цели становятся тяжёлыми.',
  },
  {
    eyebrow: 'Опора',
    question: 'Кто или что должно быть рядом, чтобы ты не тащил путь в одиночку?',
    placeholder: 'Сын, семья, друзья, наставник, рабочая среда...',
    rationale: 'Связь и среда повышают шанс действия.',
  },
  {
    eyebrow: 'Критерий победы',
    question: 'По каким признакам ты поймёшь: “я пришёл к этой версии себя”?',
    placeholder: 'Нет долгов, работа нравится, держу слово, есть спокойствие...',
    rationale: 'Фиксируем понятный финиш для согласования целей.',
  },
];

export const rulesProvider: AiProvider = {
  name: 'rules',
  async generate(input) {
    const plan = buildRulesPlan(input);
    const shouldFinalize = input.answers.length >= input.maxQuestions;
    const nextQuestion = shouldFinalize ? null : pickNextQuestion(input.answers);

    return {
      ...plan,
      nextQuestion,
      shouldFinalize,
      provider: 'rules',
    };
  },
};

export function buildRulesPlan(input: KodaAiInput): KodaPlan {
  const answerText = input.answers.map((item) => item.answer).join(' ').toLowerCase();
  const hasCareer = hasAny(answerText, ['data', 'sql', 'аналитик', 'работ', 'доход', 'карьер']);
  const hasDebt = hasAny(answerText, ['долг', 'кредит', 'деньг', 'подушк', 'финанс']);
  const hasHealth = hasAny(answerText, ['сон', 'вес', 'спорт', 'здоров', 'энерг', 'устал']);
  const hasFamily = hasAny(answerText, ['сын', 'семь', 'отнош', 'дом', 'близк']);
  const hasOverload = hasAny(answerText, ['перегруз', 'брос', 'расфокус', 'хаос', 'устал', 'не могу']);

  const goals = [
    {
      title: 'Карьера и доход',
      target: hasCareer
        ? 'Понятный профессиональный трек, рост навыков и дохода.'
        : 'Роль и доход, которые дают ощущение роста и устойчивости.',
      firstStep: hasCareer
        ? 'Изучить один рабочий навык 45 минут и сохранить заметный результат.'
        : 'Выбрать один навык для роста и дать ему 30 минут.',
    },
    {
      title: 'Финансовая устойчивость',
      target: hasDebt
        ? 'Снизить давление долгов, увидеть расходы и начать подушку.'
        : 'Собрать понятную картину денег и снизить финансовый шум.',
      firstStep: 'Выписать обязательные платежи за месяц.',
    },
    {
      title: 'Энергия и здоровье',
      target: hasHealth
        ? 'Сон, вес и привычки должны поддерживать путь.'
        : 'Поднять базовую энергию, чтобы цели не держались на героизме.',
      firstStep: 'Выбрать один восстановительный ритуал на завтра.',
    },
    {
      title: 'Отношения и опора',
      target: hasFamily
        ? 'Больше спокойного времени с важными людьми.'
        : 'Добавить поддержку и меньше тащить путь в одиночку.',
      firstStep: 'Запланировать одно конкретное действие для близкого человека.',
    },
  ];

  const archetype = hasOverload ? 'Спринтер с высоким трением старта' : 'Строитель устойчивого ритма';

  return {
    userProfile: {
      archetype,
      description: hasOverload
        ? 'Тебе важен быстрый видимый результат, но большие планы и перегруз могут останавливать старт.'
        : 'Тебе подходит спокойная система маленьких повторяемых действий и понятная обратная связь.',
      strategy:
        'KODA будет давать маленькие действия на 15–60 минут, фиксировать прогресс и снижать трение перед началом.',
    },
    futureTitle: `${input.name || 'Твоя'} версия ${input.targetYear || '2029'}`,
    summary: 'Черновик пути собран вокруг будущей идентичности, видимого прогресса и маленьких действий.',
    nextQuestion: pickNextQuestion(input.answers),
    goals,
    nextStep: hasCareer ? 'Сделать один 45-минутный шаг к рабочему навыку' : 'Сделать один 30-минутный шаг к главной цели',
    explanation: 'KODA собрал ответ по твоим формулировкам, ключевым темам и текущему профилю движения.',
    progressReward: '+0.12% к версии себя',
    visualPrompt: 'Текущий персонаж постепенно идёт к спокойной уверенной версии себя в светлом рабочем пространстве.',
  };
}

function pickNextQuestion(answers: Answer[]) {
  return questionFlow[Math.min(answers.length, questionFlow.length - 1)];
}

function hasAny(text: string, needles: string[]) {
  return needles.some((needle) => text.includes(needle));
}
