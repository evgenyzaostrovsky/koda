import { DashboardScreen } from './src/features/dashboard/DashboardScreen';
import { KodaSpherePreview } from './src/features/onboarding/components/KodaSpherePreview';

type AppStage = 'onboarding' | 'dashboard';

export default function App() {
  const stage: AppStage = 'onboarding';

  if (stage === 'onboarding') {
    return <KodaSpherePreview />;
  }

  return <DashboardScreen />;
}
