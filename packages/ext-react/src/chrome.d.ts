// Minimal Chrome extension API type declarations (Manifest V3)

declare namespace chrome {
  namespace sidePanel {
    function setPanelBehavior(options: { openPanelOnActionClick: boolean }): void;
    function open(options: { tabId: number }): void;
  }

  namespace storage {
    interface StorageArea {
      get(keys: string | string[], callback: (result: Record<string, any>) => void): void;
      set(items: Record<string, any>, callback?: () => void): void;
    }
    const sync: StorageArea;
  }

  namespace runtime {
    function getURL(path: string): string;
    function sendMessage(message: any, callback?: (response: any) => void): void;
    const onMessage: {
      addListener(
        callback: (
          message: any,
          sender: { tab?: { id?: number; url?: string } },
          sendResponse: (response?: any) => void,
        ) => boolean | void,
      ): void;
    };
  }

  namespace tabs {
    function create(options: { url: string }): void;
    function update(tabId: number, options: { url: string }): Promise<void>;
    function query(
      queryInfo: { active?: boolean; currentWindow?: boolean },
    ): Promise<Array<{ id?: number; url?: string }>>;
  }
}
