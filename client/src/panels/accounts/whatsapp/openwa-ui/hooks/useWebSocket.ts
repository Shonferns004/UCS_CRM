import { useCallback, useMemo } from 'react';

/**
 * The OpenWA dashboard's live feed is a socket.io connection authenticated with the
 * gateway API key. That key stays server-side in the CRM, so the vendored Chats UI
 * runs without the socket and relies on polling instead (see Chats.tsx and
 * useChatMessages). The hook keeps the dashboard's shape so no component changes.
 */
export function useWebSocket(_events?: unknown) {
  const reconnect = useCallback(() => {}, []);
  const subscribe = useCallback((_sessionId: string, _events?: string[]) => {}, []);
  const unsubscribe = useCallback((_sessionId: string) => {}, []);

  return useMemo(
    () => ({
      isConnected: false,
      connectionFailed: false,
      reconnect,
      subscribe,
      unsubscribe,
      rejoins: 0,
    }),
    [reconnect, subscribe, unsubscribe],
  );
}
