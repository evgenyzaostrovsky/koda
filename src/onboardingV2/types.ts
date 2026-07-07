import type { LifeAreaId } from './futureSelfData';

export type AreaDetails = {
  areaId: LifeAreaId;
  pains: string[];
  priority: string;
  meaning: string;
};

export type FutureSelfCard = {
  title: string;
  traits: string[];
  description: string;
  transformation: string;
  aiReflection: string;
};

export type FutureSelfStep =
  | 'welcome'
  | 'areas'
  | 'areaDetails'
  | 'reflection'
  | 'futureChanges'
  | 'transformation'
  | 'futureSelf'
  | 'confirm'
  | 'ready';
