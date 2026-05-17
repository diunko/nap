// Minimal Chrome extension API type declarations (Manifest V3)

declare namespace chrome {
  namespace sidePanel {
    function setPanelBehavior(options: { openPanelOnActionClick: boolean }): void;
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
    const onMessage: {
      addListener(
        callback: (
          message: any,
          sender: any,
          sendResponse: (response?: any) => void,
        ) => boolean | void,
      ): void;
    };
  }

  namespace tabs {
    function create(options: { url: string }): void;
    function update(tabId: number, options: { url: string }): void;
    function query(
      queryInfo: { active?: boolean; currentWindow?: boolean },
      callback: (tabs: Array<{ id?: number }>) => void,
    ): void;
  }
}
