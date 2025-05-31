import React, { createContext, useState, ReactNode } from 'react';

interface GlobalAppContextType {
  firmwareUpdateMode: boolean;
  setFirmwareUpdateMode: (value: boolean) => void;
}

const defaultContext: GlobalAppContextType = {
  firmwareUpdateMode: false,
  setFirmwareUpdateMode: () => {},
};

export const GlobalAppContext = createContext<GlobalAppContextType>(defaultContext);

interface GlobalAppProviderProps {
  children: ReactNode;
}

export const GlobalAppProvider: React.FC<GlobalAppProviderProps> = ({ children }) => {
  const [firmwareUpdateMode, setFirmwareUpdateMode] = useState(false);

  return (
    <GlobalAppContext.Provider value={{ 
      firmwareUpdateMode,
      setFirmwareUpdateMode
    }}>
      {children}
    </GlobalAppContext.Provider>
  );
};