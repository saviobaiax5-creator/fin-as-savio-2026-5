import React, { createContext, useCallback, useContext } from 'react';
import type { MoneyCents } from '../domain/money/money';
import { formatCurrency, type FormatCurrencyOptions } from '../utils/formatters';

export interface UiPreferencesContextValue {
  isPrivacyMode: boolean;
  togglePrivacyMode: () => void;
  setPrivacyMode: (value: boolean) => void;
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
  isPrivacyMode: false,
  togglePrivacyMode: () => {},
  setPrivacyMode: () => {},
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

export function useCurrencyFormatter() {
  const {
    isPrivacyMode,
    hideValues,
    togglePrivacyMode,
    toggleHideValues,
    setPrivacyMode,
    setHideValues,
  } = usePrivacy();

  const privacyActive = isPrivacyMode ?? hideValues;

  const format = useCallback(
    (
      value: number | string | MoneyCents | undefined | null,
      options?: FormatCurrencyOptions
    ) => formatCurrency(value, privacyActive, options),
    [privacyActive]
  );

  return {
    isPrivacyMode: privacyActive,
    togglePrivacyMode: togglePrivacyMode ?? toggleHideValues,
    setPrivacyMode: setPrivacyMode ?? setHideValues,
    formatCurrency: format,
    privacyBlurClass: privacyActive ? 'sf-privacy-blur' : '',
  };
}
