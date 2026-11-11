import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ConfigProvider } from './context/ConfigContext';
import { Isa88Provider } from './context/Isa88Context';
import { MasterDataProvider } from './context/MasterDataContext';
import { OperationsProvider } from './context/OperationsContext';
import { QualityProvider } from './context/QualityContext';
import { InventoryProvider } from './context/InventoryContext';
import { EquipmentProvider } from './context/EquipmentContext';
import { ReportProvider } from './context/ReportContext';
import { Navbar, ActiveNavTab } from './components/layout/Navbar';
import { LoginScreen } from './components/auth/LoginScreen';
import { SystemConfigView } from './views/SystemConfigView';
import { Isa88ModelView } from './views/Isa88ModelView';
import { MasterDataView } from './views/MasterDataView';
import { OperationsView } from './views/OperationsView';
import { QualityView } from './views/QualityView';
import { InventoryView } from './views/InventoryView';
import { EquipmentMaintenanceView } from './views/EquipmentMaintenanceView';
import { EnterpriseReportCenterView } from './views/EnterpriseReportCenterView';
import { OEEDashboard } from './pages/OEEDashboard';
import { ActiveAlarmBanner } from './components/ActiveAlarmBanner';
import { AICopilotDrawer } from './components/AICopilotDrawer';
import { PinnedTagPalette } from './components/PinnedTagPalette';
import { useReports } from './context/ReportContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return <>{children}</>;
};

const MainLayout: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveNavTab>('Configuration');
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState<boolean>(false);
  const { setActiveSubTab } = useReports();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900">
        {/* Global Navbar visible after login */}
        <Navbar 
          activeTab={activeTab} 
          onSelectTab={setActiveTab} 
          onToggleAiDrawer={() => setIsAiDrawerOpen(prev => !prev)}
          isAiDrawerOpen={isAiDrawerOpen}
        />

        {/* Persistent Active Alarm Banner (ISA-18.2 Compliant) */}
        <ActiveAlarmBanner
          onNavigateToAlarmReport={() => {
            setActiveTab('Reports');
            setActiveSubTab('alarm_incident');
          }}
        />

        {/* Main Content Area */}
        <div className="flex-1">
          {activeTab === 'Configuration' && (
            <ErrorBoundary moduleName="Configuration">
              <SystemConfigView />
            </ErrorBoundary>
          )}
          {activeTab === 'ISA-88 Model' && (
            <ErrorBoundary moduleName="ISA-88 Batch Model">
              <Isa88ModelView />
            </ErrorBoundary>
          )}
          {activeTab === 'Master Data' && (
            <ErrorBoundary moduleName="Master Data">
              <MasterDataView />
            </ErrorBoundary>
          )}
          {activeTab === 'Operations' && (
            <ErrorBoundary moduleName="Operations & Batch Execution">
              <OperationsView />
            </ErrorBoundary>
          )}
          {activeTab === 'OEE PERFORMANCE' && (
            <ErrorBoundary moduleName="OEE Performance">
              <OEEDashboard />
            </ErrorBoundary>
          )}
          {activeTab === 'Quality' && (
            <ErrorBoundary moduleName="Quality Control">
              <QualityView />
            </ErrorBoundary>
          )}
          {activeTab === 'Inventory' && (
            <ErrorBoundary moduleName="Material Inventory & Tank Telemetry">
              <InventoryView />
            </ErrorBoundary>
          )}
          {activeTab === 'Maintenance' && (
            <ErrorBoundary moduleName="Equipment & Maintenance">
              <EquipmentMaintenanceView />
            </ErrorBoundary>
          )}
          {activeTab === 'Reports' && (
            <ErrorBoundary moduleName="Enterprise Reports & Audits">
              <EnterpriseReportCenterView />
            </ErrorBoundary>
          )}
        </div>

        {/* AI Operations Copilot Slide-over Drawer */}
        <AICopilotDrawer 
          isOpen={isAiDrawerOpen} 
          onClose={() => setIsAiDrawerOpen(false)} 
        />

        {/* Global Pinnable Floating Tag Palette & Kepware Tree Scanner */}
        <PinnedTagPalette activeTab={activeTab} />

        {/* Industrial Footer */}
        <footer className="border-t border-slate-200 bg-white py-3 px-6 text-[11px] text-slate-500 font-mono flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span>ISA-95 LEVEL 3 MOM SYSTEM</span>
            <span>•</span>
            <span>MODULE 01: SYSTEM CONFIGURATION</span>
            <span>•</span>
            <span>MODULE 02: ISA-88 BATCH MODEL</span>
            <span>•</span>
            <span>MODULE 03: MASTER DATA</span>
            <span>•</span>
            <span>MODULE 04: OPERATIONS</span>
            <span>•</span>
            <span>MODULE 05: QUALITY MANAGEMENT</span>
            <span>•</span>
            <span>MODULE 06: MATERIAL INVENTORY</span>
            <span>•</span>
            <span>MODULE 07: EQUIPMENT & MAINTENANCE</span>
            <span>•</span>
            <span>MODULE 08: REPORT CENTER</span>
          </div>
          <div>
            <span>HIGH-PERFORMANCE HMI (ISA-101 COMPLIANT)</span>
          </div>
        </footer>
    </div>
  );
};

export const App: React.FC = () => {
  React.useEffect(() => {
    // Small tick to ensure browser has painted the DOM
    requestAnimationFrame(() => {
      window.electronAPI?.sendAppMounted?.();
    });
  }, []);

  return (
    <AuthProvider>
      <ConfigProvider>
        <ProtectedRoute>
          <Isa88Provider>
            <MasterDataProvider>
              <OperationsProvider>
                <QualityProvider>
                  <InventoryProvider>
                    <EquipmentProvider>
                      <ReportProvider>
                        <MainLayout />
                      </ReportProvider>
                    </EquipmentProvider>
                  </InventoryProvider>
                </QualityProvider>
              </OperationsProvider>
            </MasterDataProvider>
          </Isa88Provider>
        </ProtectedRoute>
      </ConfigProvider>
    </AuthProvider>
  );
};

export default App;
