let ioInstance;

export const initSocket = (io) => {
  ioInstance = io;
  io.on('connection', (socket) => {
    socket.on('join', (room) => socket.join(room));
  });
};

export const emitOrderUpdate = (order) => {
  if (!ioInstance) return;
  ioInstance.emit('order:update', order);
};

export const emitStockUpdate = (variant) => {
  if (!ioInstance) return;
  ioInstance.emit('stock:update', variant);
};
