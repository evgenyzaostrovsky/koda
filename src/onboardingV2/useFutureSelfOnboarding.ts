import { useEffect, useMemo, useState } from 'react';
import { rulesProvider } from '../ai/rulesProvider';
import { generateKodaState, getAiMode } from '../services/kodaApi';
import type { AiMode, Answer } from '../types/koda';
import { getArea, type LifeAreaId } from './futureSelfData';
import type { AreaDetails, FutureSelfCard, FutureSelfStep } from './types';

const maxAreas = 3;

export function useFutureSelfOnboarding() {
  const [aiMode, setAiMode] = useState<AiMode>('checking');
  const [step, setStep] = useState<FutureSelfStep>('welcome');
  const [name, setName] = useState('Евгений');
  const [targetYear, setTargetYear] = useState('2029');
  const [selectedAreas, setSelectedAreas] = useState<LifeAreaId[]>([]);
  const [areaIndex, setAreaIndex] = useState(0);
  const [areaDetails, setAreaDetails] = useState<AreaDetails[]>([]);
  const [draftPains, setDraftPains] = useState<string[]>([]);
  const [draftPriority, setDraftPriority] = useState('');
  const [draftMeaning, setDraftMeaning] = useState('');
  const [reflection, setReflection] = useState('');
  const [futureChanges, setFutureChanges] = useState('');
  const [transformation, setTransformation] = useState('');
  const [futureSelf, setFutureSelf] = useState<FutureSelfCard | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    getAiMode().then(setAiMode);
  }, []);

  const currentArea = useMemo(() => getArea(selectedAreas[areaIndex]), [areaIndex, selectedAreas]);
  const progress = getProgress(step, selectedAreas.length, areaIndex);
  const canContinueWelcome = name.trim().length > 1 && targetYear.trim().length === 4;
  const canContinueAreas = selectedAreas.length > 0;
  const canContinueArea = draftPains.length > 0 && Boolean(draftPriority) && draftMeaning.trim().length > 4;
  const canContinueFuture = futureChanges.trim().length > 6;
  const canContinueTransformation = transformation.trim().length > 2;

  function toggleArea(areaId: LifeAreaId) {
    setSelectedAreas((current) => {
      if (current.includes(areaId)) {
        return current.filter((id) => id !== areaId);
      }

      if (current.length >= maxAreas) {
        return current;
      }

      return [...current, areaId];
    });
  }

  function togglePain(pain: string) {
    setDraftPains((current) => (current.includes(pain) ? current.filter((item) => item !== pain) : [...current, pain]));
  }

  function startAreaDetails() {
    setAreaIndex(0);
    resetAreaDraft();
    setAreaDetails([]);
    setStep('areaDetails');
  }

  async function saveAreaDetails() {
    if (!currentArea) {
      return;
    }

    const nextDetails = [
      ...areaDetails,
      {
        areaId: currentArea.id,
        pains: draftPains,
        priority: draftPriority,
        meaning: draftMeaning.trim(),
      },
    ];

    setAreaDetails(nextDetails);

    if (areaIndex < selectedAreas.length - 1) {
      setAreaIndex((current) => current + 1);
      resetAreaDraft();
      return;
    }

    setIsLoading(true);
    const generatedReflection = await generateReflection(nextDetails);
    setReflection(generatedReflection);
    setIsLoading(false);
    setStep('reflection');
  }

  async function buildFutureSelf() {
    setIsLoading(true);
    const card = await generateFutureSelf();
    setFutureSelf(card);
    setIsLoading(false);
    setStep('futureSelf');
  }

  function back() {
    if (step === 'areas') {
      setStep('welcome');
      return;
    }

    if (step === 'areaDetails') {
      if (areaIndex === 0) {
        setStep('areas');
        return;
      }

      const previousIndex = areaIndex - 1;
      const previous = areaDetails[previousIndex];
      setAreaIndex(previousIndex);
      setAreaDetails((current) => current.slice(0, -1));
      setDraftPains(previous.pains);
      setDraftPriority(previous.priority);
      setDraftMeaning(previous.meaning);
      return;
    }

    if (step === 'reflection') setStep('areaDetails');
    if (step === 'futureChanges') setStep('reflection');
    if (step === 'transformation') setStep('futureChanges');
    if (step === 'futureSelf') setStep('transformation');
    if (step === 'confirm') setStep('futureSelf');
  }

  function reset() {
    setStep('welcome');
    setSelectedAreas([]);
    setAreaIndex(0);
    setAreaDetails([]);
    setFutureChanges('');
    setTransformation('');
    setFutureSelf(null);
    resetAreaDraft();
  }

  function resetAreaDraft() {
    setDraftPains([]);
    setDraftPriority('');
    setDraftMeaning('');
  }

  async function generateReflection(details: AreaDetails[]) {
    const plan = await generateFromAi('AI reflection', details);
    return plan.summary || plan.explanation || buildRulesReflection(details);
  }

  async function generateFutureSelf() {
    const plan = await generateFromAi('Карточка будущей версии', areaDetails);
    const traits = plan.goals.slice(0, 5).map((goal) => goal.target.replace(/\.$/, ''));

    return {
      title: `Будущий ${name}`,
      traits: traits.length ? traits : buildTraitsFromDetails(areaDetails),
      description: plan.summary,
      transformation,
      aiReflection: plan.explanation,
    };
  }

  async function generateFromAi(label: string, details: AreaDetails[]) {
    const answers: Answer[] = [
      {
        eyebrow: 'KODA Onboarding V2',
        question: label,
        placeholder: '',
        rationale: 'Состояние сборщика будущей версии',
        answer: JSON.stringify({
          selectedAreas: selectedAreas.map((id) => getArea(id)?.title || id),
          details: details.map((item) => ({
            area: getArea(item.areaId)?.title || item.areaId,
            pains: item.pains,
            priority: item.priority,
            meaning: item.meaning,
          })),
          futureChanges,
          transformation,
          instruction:
            'Собери не список задач, а будущую версию личности. Кратко, по-русски, без клинических диагнозов. Сфокусируйся на 1-3 года и будущей идентичности.',
        }),
      },
    ];

    try {
      const result = await generateKodaState({
        name,
        targetYear,
        answers,
        maxQuestions: 1,
      });
      setAiMode(result.provider);
      return result;
    } catch {
      setAiMode('offline');
      return rulesProvider.generate({
        name,
        targetYear,
        answers,
        maxQuestions: 1,
      });
    }
  }

  return {
    aiMode,
    areaDetails,
    areaIndex,
    back,
    buildFutureSelf,
    canContinueArea,
    canContinueAreas,
    canContinueFuture,
    canContinueTransformation,
    canContinueWelcome,
    currentArea,
    draftMeaning,
    draftPains,
    draftPriority,
    futureChanges,
    futureSelf,
    isLoading,
    maxAreas,
    name,
    progress,
    reflection,
    reset,
    saveAreaDetails,
    selectedAreas,
    setDraftMeaning,
    setDraftPriority,
    setFutureChanges,
    setName,
    setStep,
    setTargetYear,
    setTransformation,
    startAreaDetails,
    step,
    targetYear,
    toggleArea,
    togglePain,
    transformation,
  };
}

function getProgress(step: FutureSelfStep, selectedCount: number, areaIndex: number) {
  const areaScreens = Math.max(1, selectedCount);
  const total = 6 + areaScreens;
  const base: Record<FutureSelfStep, number> = {
    welcome: 0,
    areas: 1,
    areaDetails: 2 + areaIndex,
    reflection: 2 + areaScreens,
    futureChanges: 3 + areaScreens,
    transformation: 4 + areaScreens,
    futureSelf: 5 + areaScreens,
    confirm: 6 + areaScreens,
    ready: total,
  };

  return Math.round((base[step] / total) * 100);
}

function buildRulesReflection(details: AreaDetails[]) {
  const themes = details.map((item) => getArea(item.areaId)?.title).filter(Boolean).join(', ');
  const priorities = details.map((item) => item.priority).join(', ');

  return `Похоже, сейчас важны не отдельные задачи, а переход к более спокойной и управляемой жизни. Я вижу основные темы: ${themes}. Главные изменения: ${priorities}. Насколько это похоже на тебя?`;
}

function buildTraitsFromDetails(details: AreaDetails[]) {
  return details.slice(0, 5).map((item) => `${getArea(item.areaId)?.title}: ${item.priority}`);
}
