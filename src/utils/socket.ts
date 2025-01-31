import { io } from 'socket.io-client';

const socket = io('https://api.valo.istanbul/customer', {
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
}); // Sunucu adresinizi buraya yazın

// Socket olaylarını dinleme
socket.on('connect', () => {
  console.log('Socket connected');
    });
    
socket.on('disconnect', () => {
  console.log('Socket disconnected');
    });

// Socket'i dışa aktar
export default socket;