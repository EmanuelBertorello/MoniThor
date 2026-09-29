// src/hooks/useSocket.js
import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

let socketInstance = null;

export function useSocket(campaignId, handlers = {}) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!campaignId) return;

    if (!socketInstance) {
      socketInstance = io(API_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
      });
    }

    const socket = socketInstance;

    socket.emit('join:campaign', campaignId);

    const onMentionsNew = (data) => {
      handlersRef.current.onMentionsNew?.(data);
    };

    const onAlert = (data) => {
      handlersRef.current.onAlert?.(data);
    };

    const onScraperTestProgress = (data) => {
      handlersRef.current.onScraperTestProgress?.(data);
    };

    const onConnect = () => {
      handlersRef.current.onConnect?.();
      socket.emit('join:campaign', campaignId);
    };

    const onDisconnect = () => {
      handlersRef.current.onDisconnect?.();
    };

    socket.on('mentions:new', onMentionsNew);
    socket.on('alert', onAlert);
    socket.on('scraper-test:progress', onScraperTestProgress);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.emit('leave:campaign', campaignId);
      socket.off('mentions:new', onMentionsNew);
      socket.off('alert', onAlert);
      socket.off('scraper-test:progress', onScraperTestProgress);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [campaignId]);

  const emit = useCallback((event, data) => {
    socketInstance?.emit(event, data);
  }, []);

  return { socket: socketInstance, emit, isConnected: socketInstance?.connected };
}
