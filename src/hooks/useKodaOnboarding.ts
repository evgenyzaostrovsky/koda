import { useEffect, useState } from 'react';
import { firstQuestion, rulesProvider } from '../ai/rulesProvider';
import { generateKodaState, getAiMode } from '../services/kodaApi';
import type { AiMode, Answer, KodaPlan, Question } from '../types/koda';

export type AppStep = 'welcome' | 'questions' | 'review' | 'ready';

const MAX_QUESTIONS = 7;

export function useKodaOnboarding() {
  const [aiMode, setAiMode] = useState<AiMode>('checking');
  const [step, setStep] = useState<AppStep>('welcome');
  const [name, setName] = useState('Евгений');
  const [targetYear, setTargetYear] = useState('2029');
  const [currentQuestion, setCurrentQuestion] = useState<Question>(firstQuestion);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [plan, setPlan] = useState<KodaPlan | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    getAiMode().then(setAiMode);
  }, []);

  const progress = step === 'welcome' ? 0 : Math.min(100, Math.round((answers.length / MAX_QUESTIONS) * 100));
  const canContinueWelcome = name.trim().length > 1 && targetYear.trim().length === 4;
  const canContinueQuestion = currentAnswer.trim().length > 2 && !isLoading;

  function resetOnboarding() {
    setCurrentQuestion(firstQuestion);
    setCurrentAnswer('');
    setAnswers([]);
    setPlan(null);
  }

  async function start() {
    resetOnboarding();
    setStep('questions');
  }

  async function next() {
    const nextAnswers = [...answers, { ...currentQuestion, answer: currentAnswer.trim() }];
    setAnswers(nextAnswers);
    setCurrentAnswer('');
    setIsLoading(true);

    const result = await generate(nextAnswers);
    setPlan(result);

    setAiMode(result.provider);

    if (result.shouldFinalize || nextAnswers.length >= MAX_QUESTIONS || !result.nextQuestion) {
      setStep('review');
      setIsLoading(false);
      return;
    }

    setCurrentQuestion(result.nextQuestion);
    setIsLoading(false);
  }

  function back() {
    if (answers.length === 0) {
      setStep('welcome');
      return;
    }

    const previous = answers[answers.length - 1];
    setAnswers((current) => current.slice(0, -1));
    setCurrentQuestion({
      eyebrow: previous.eyebrow,
      question: previous.question,
      placeholder: previous.placeholder,
      rationale: previous.rationale,
    });
    setCurrentAnswer(previous.answer);
  }

  async function generate(nextAnswers: Answer[]) {
    try {
      return await generateKodaState({
        name,
        targetYear,
        answers: nextAnswers,
        maxQuestions: MAX_QUESTIONS,
      });
    } catch {
      setAiMode('offline');
      return rulesProvider.generate({
        name,
        targetYear,
        answers: nextAnswers,
        maxQuestions: MAX_QUESTIONS,
      });
    }
  }

  return {
    aiMode,
    answers,
    back,
    canContinueQuestion,
    canContinueWelcome,
    currentAnswer,
    currentQuestion,
    isLoading,
    maxQuestions: MAX_QUESTIONS,
    name,
    next,
    plan,
    progress,
    resetOnboarding,
    setCurrentAnswer,
    setName,
    setStep,
    setTargetYear,
    start,
    step,
    targetYear,
  };
}
