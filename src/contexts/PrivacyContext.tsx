import React, { createContext, useContext } from 'react';

export interface UiPreferencesContextValue {
  hideValues: boolean;
  toggleHideValues: () => void;
  setHideValues: (value: boolean) => void;
  showScopeBar: boolean;
  toggleScopeBar: () => void;
  setShowScopeBar: (value: boolean) => void;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (value: boolean) => void;
}

const UiPreferencesContext = createContext<UiPreferencesContextValue>({
  hideValues: false,
  toggleHideValues: () => {},
  setHideValues: () => {},
  showScopeBar: true,
  toggleScopeBar: () => {},
  setShowScopeBar: () => {},
  sidebarOpen: true,
  toggleSidebar: () => {},
  setSidebarOpen: () => {},
});

export const PrivacyProvider: React.FC<{
  value: UiPreferencesContextValue;
  children: React.ReactNode;
}> = ({ value, children }) => {
  return (
    <UiPreferencesContext.Provider value={value}>
      {children}
    </UiPreferencesContext.Provider>
  );
};

export function usePrivacy(): UiPreferencesContextValue {
  return useContext(UiPreferencesContext);
}
