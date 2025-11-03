import React, { createContext, useContext, useMemo, useState } from 'react';

type TimeContextValue = {
  selectedTime: Date | null;
  setSelectedTime: (t: Date | null) => void;
};

const TimeContext = createContext<TimeContextValue | undefined>(undefined);

export const TimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedTime, setSelectedTime] = useState<Date | null>(null);

  const value = useMemo(() => ({ selectedTime, setSelectedTime }), [selectedTime]);

  return <TimeContext.Provider value={value}>{children}</TimeContext.Provider>;
};

export const useTimeContext = (): TimeContextValue => {
  const ctx = useContext(TimeContext);
  if (!ctx) throw new Error('useTimeContext must be used within a TimeProvider');
  return ctx;
};






