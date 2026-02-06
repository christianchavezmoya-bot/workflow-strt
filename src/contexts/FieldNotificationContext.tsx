import { createContext, useContext, useState, ReactNode } from 'react';

interface FieldNotification {
  id: string;
  fieldName: string;
  timestamp: number;
}

interface FieldNotificationContextType {
  notifications: FieldNotification[];
  addNotification: (fieldName: string) => void;
  dismissNotification: (id: string) => void;
  clearAll: () => void;
}

const FieldNotificationContext = createContext<FieldNotificationContextType | undefined>(undefined);

export const FieldNotificationProvider = ({ children }: { children: ReactNode }) => {
  const [notifications, setNotifications] = useState<FieldNotification[]>([]);

  const addNotification = (fieldName: string) => {
    const notification: FieldNotification = {
      id: `${Date.now()}-${Math.random()}`,
      fieldName,
      timestamp: Date.now(),
    };
    setNotifications(prev => [notification, ...prev]);
  };

  const dismissNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const clearAll = () => {
    setNotifications([]);
  };

  return (
    <FieldNotificationContext.Provider
      value={{ notifications, addNotification, dismissNotification, clearAll }}
    >
      {children}
    </FieldNotificationContext.Provider>
  );
};

export const useFieldNotifications = () => {
  const context = useContext(FieldNotificationContext);
  if (!context) {
    throw new Error('useFieldNotifications must be used within FieldNotificationProvider');
  }
  return context;
};
