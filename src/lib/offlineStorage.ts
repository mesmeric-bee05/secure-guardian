// IndexedDB wrapper for offline data persistence

const DB_NAME = 'afya-yetu-offline';
const DB_VERSION = 2;

interface OfflineMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  synced: boolean;
}

interface OfflineEmergencyAlert {
  id: string;
  symptoms: string;
  priority: string;
  latitude: number;
  longitude: number;
  timestamp: number;
  synced: boolean;
}

interface PendingAction {
  id: string;
  type: 'emergency_alert' | 'chat_message' | 'profile_update';
  data: Record<string, unknown>;
  timestamp: number;
  priority: number; // Lower = higher priority
  synced: boolean;
}

class OfflineStorage {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Store for offline chat messages
        if (!db.objectStoreNames.contains('messages')) {
          const messagesStore = db.createObjectStore('messages', { keyPath: 'id' });
          messagesStore.createIndex('timestamp', 'timestamp', { unique: false });
          messagesStore.createIndex('synced', 'synced', { unique: false });
        }

        // Store for offline emergency alerts
        if (!db.objectStoreNames.contains('emergencyAlerts')) {
          const alertsStore = db.createObjectStore('emergencyAlerts', { keyPath: 'id' });
          alertsStore.createIndex('timestamp', 'timestamp', { unique: false });
          alertsStore.createIndex('synced', 'synced', { unique: false });
        }

        // Store for cached first aid protocols
        if (!db.objectStoreNames.contains('protocols')) {
          db.createObjectStore('protocols', { keyPath: 'id' });
        }

        // Store for cached facilities
        if (!db.objectStoreNames.contains('facilities')) {
          const facilitiesStore = db.createObjectStore('facilities', { keyPath: 'id' });
          facilitiesStore.createIndex('city', 'city', { unique: false });
        }

        // Store for pending actions (v2)
        if (!db.objectStoreNames.contains('pendingActions')) {
          const actionsStore = db.createObjectStore('pendingActions', { keyPath: 'id' });
          actionsStore.createIndex('priority', 'priority', { unique: false });
          actionsStore.createIndex('timestamp', 'timestamp', { unique: false });
          actionsStore.createIndex('synced', 'synced', { unique: false });
        }

        // Store for cached user profile (v2)
        if (!db.objectStoreNames.contains('userProfile')) {
          db.createObjectStore('userProfile', { keyPath: 'user_id' });
        }

        // Store for sync metadata (v2)
        if (!db.objectStoreNames.contains('syncMeta')) {
          db.createObjectStore('syncMeta', { keyPath: 'key' });
        }
      };
    });
  }

  async saveMessage(message: Omit<OfflineMessage, 'id' | 'timestamp' | 'synced'>): Promise<string> {
    await this.ensureDb();
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const transaction = this.db!.transaction(['messages'], 'readwrite');
      const store = transaction.objectStore('messages');
      
      const messageWithMeta: OfflineMessage = {
        ...message,
        id,
        timestamp: Date.now(),
        synced: navigator.onLine,
      };

      const request = store.add(messageWithMeta);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(id);
    });
  }

  async getMessages(): Promise<OfflineMessage[]> {
    await this.ensureDb();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readonly');
      const store = transaction.objectStore('messages');
      const request = store.getAll();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async saveEmergencyAlert(alert: Omit<OfflineEmergencyAlert, 'id' | 'timestamp' | 'synced'>): Promise<string> {
    await this.ensureDb();
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const transaction = this.db!.transaction(['emergencyAlerts'], 'readwrite');
      const store = transaction.objectStore('emergencyAlerts');
      
      const alertWithMeta: OfflineEmergencyAlert = {
        ...alert,
        id,
        timestamp: Date.now(),
        synced: false,
      };

      const request = store.add(alertWithMeta);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(id);
    });
  }

  async getUnsyncedAlerts(): Promise<OfflineEmergencyAlert[]> {
    await this.ensureDb();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['emergencyAlerts'], 'readonly');
      const store = transaction.objectStore('emergencyAlerts');
      const request = store.getAll();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const alerts = request.result as OfflineEmergencyAlert[];
        resolve(alerts.filter(alert => !alert.synced));
      };
    });
  }

  async markAlertSynced(id: string): Promise<void> {
    await this.ensureDb();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['emergencyAlerts'], 'readwrite');
      const store = transaction.objectStore('emergencyAlerts');
      const getRequest = store.get(id);
      
      getRequest.onerror = () => reject(getRequest.error);
      getRequest.onsuccess = () => {
        const alert = getRequest.result;
        if (alert) {
          alert.synced = true;
          const updateRequest = store.put(alert);
          updateRequest.onerror = () => reject(updateRequest.error);
          updateRequest.onsuccess = () => resolve();
        } else {
          resolve();
        }
      };
    });
  }

  // Pending Actions methods
  async queueAction(action: Omit<PendingAction, 'id' | 'timestamp' | 'synced'>): Promise<string> {
    await this.ensureDb();
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const transaction = this.db!.transaction(['pendingActions'], 'readwrite');
      const store = transaction.objectStore('pendingActions');
      
      const actionWithMeta: PendingAction = {
        ...action,
        id,
        timestamp: Date.now(),
        synced: false,
      };

      const request = store.add(actionWithMeta);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(id);
    });
  }

  async getPendingActions(): Promise<PendingAction[]> {
    await this.ensureDb();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['pendingActions'], 'readonly');
      const store = transaction.objectStore('pendingActions');
      const request = store.getAll();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const actions = request.result as PendingAction[];
        resolve(actions.filter(a => !a.synced).sort((a, b) => a.priority - b.priority));
      };
    });
  }

  async markActionSynced(id: string): Promise<void> {
    await this.ensureDb();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['pendingActions'], 'readwrite');
      const store = transaction.objectStore('pendingActions');
      const getRequest = store.get(id);
      
      getRequest.onerror = () => reject(getRequest.error);
      getRequest.onsuccess = () => {
        const action = getRequest.result;
        if (action) {
          action.synced = true;
          const updateRequest = store.put(action);
          updateRequest.onerror = () => reject(updateRequest.error);
          updateRequest.onsuccess = () => resolve();
        } else {
          resolve();
        }
      };
    });
  }

  async getPendingCount(): Promise<number> {
    const actions = await this.getPendingActions();
    const alerts = await this.getUnsyncedAlerts();
    return actions.length + alerts.length;
  }

  // Cache methods
  async cacheProtocols(protocols: any[]): Promise<void> {
    await this.ensureDb();
    const transaction = this.db!.transaction(['protocols'], 'readwrite');
    const store = transaction.objectStore('protocols');
    store.clear();
    for (const protocol of protocols) {
      store.put(protocol);
    }
    await this.setSyncMeta('protocols_last_sync', Date.now());
  }

  async getCachedProtocols(): Promise<any[]> {
    await this.ensureDb();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['protocols'], 'readonly');
      const store = transaction.objectStore('protocols');
      const request = store.getAll();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async cacheFacilities(facilities: any[]): Promise<void> {
    await this.ensureDb();
    const transaction = this.db!.transaction(['facilities'], 'readwrite');
    const store = transaction.objectStore('facilities');
    store.clear();
    for (const facility of facilities) {
      store.put(facility);
    }
    await this.setSyncMeta('facilities_last_sync', Date.now());
  }

  async getCachedFacilities(): Promise<any[]> {
    await this.ensureDb();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['facilities'], 'readonly');
      const store = transaction.objectStore('facilities');
      const request = store.getAll();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  // Sync metadata
  async setSyncMeta(key: string, value: unknown): Promise<void> {
    await this.ensureDb();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['syncMeta'], 'readwrite');
      const store = transaction.objectStore('syncMeta');
      const request = store.put({ key, value, updatedAt: Date.now() });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getSyncMeta(key: string): Promise<unknown> {
    await this.ensureDb();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['syncMeta'], 'readonly');
      const store = transaction.objectStore('syncMeta');
      const request = store.get(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result?.value);
    });
  }

  async clearAll(): Promise<void> {
    await this.ensureDb();
    const storeNames = ['messages', 'emergencyAlerts', 'pendingActions'];
    const transaction = this.db!.transaction(storeNames, 'readwrite');
    for (const name of storeNames) {
      transaction.objectStore(name).clear();
    }
  }

  private async ensureDb(): Promise<void> {
    if (!this.db) {
      await this.init();
    }
  }
}

export const offlineStorage = new OfflineStorage();
