import { AnimatePresence } from 'framer-motion';
import { useAppContext } from './context/AppContext';
import AuthPage from './components/AuthPage';
import Header from './components/Header';
import StatsCards from './components/StatsCards';
import DashboardTab from './components/tabs/DashboardTab';
import DeliveryTab from './components/tabs/DeliveryTab';
import FunpayManagerTab from './components/tabs/FunpayManagerTab';
import TemplatesTab from './components/tabs/TemplatesTab';
import AIKeysTab from './components/tabs/AIKeysTab';
import AdminTab from './components/tabs/AdminTab';

export default function App() {
  const { token, user, activeTab } = useAppContext();

  if (!token || !user) {
    return <AuthPage />;
  }

  return (
    <div className="min-h-screen relative font-sans flex flex-col overflow-hidden pb-12">
      <div className="velvet-backdrop" />
      
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full mt-6 flex-grow">
        <StatsCards />

        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && <DashboardTab key="dashboard" />}
          {activeTab === 'delivery' && <DeliveryTab key="delivery" />}
          {activeTab === 'manager' && <FunpayManagerTab key="manager" />}
          {activeTab === 'templates' && <TemplatesTab key="templates" />}
          {activeTab === 'ai-keys' && user.role === 'admin' && <AIKeysTab key="ai-keys" />}
          {activeTab === 'admin' && user.role === 'admin' && <AdminTab key="admin" />}
        </AnimatePresence>
      </main>
    </div>
  );
}
