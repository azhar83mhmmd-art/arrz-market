// Singleton holder untuk instance Socket.IO agar bisa diakses dari routes
// tanpa circular dependency dengan server.js

let ioInstance = null;

function initSocket(server, corsOrigin) {
  const { Server } = require('socket.io');
  ioInstance = new Server(server, {
    cors: {
      origin: corsOrigin,
      methods: ['GET', 'POST'],
    },
  });

  ioInstance.on('connection', (socket) => {
    // Client marketplace publik & admin dashboard sama-sama konek ke sini.
    // Admin dashboard join room khusus supaya notifikasi tawaran/pengajuan
    // hanya dikirim ke admin, bukan broadcast ke semua pengunjung.
    socket.on('admin:join', () => {
      socket.join('admin-room');
    });

    socket.on('disconnect', () => {
      // no-op, di sini bisa ditambah logging jika perlu
    });
  });

  return ioInstance;
}

function getIO() {
  if (!ioInstance) {
    throw new Error('Socket.IO belum diinisialisasi. Panggil initSocket() dulu di server.js');
  }
  return ioInstance;
}

module.exports = { initSocket, getIO };
