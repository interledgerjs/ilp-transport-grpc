"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const lib_1 = require("../lib");
const ilp_module_loader_1 = require("ilp-module-loader");
const server = new lib_1.BtpServer({}, {
    log: ilp_module_loader_1.createLogger('btp-server'),
    authenticate: () => Promise.resolve({ account: 'alice' })
});
server.on('listening', () => {
    console.log('Listening...');
});
server.on('connection', (socket) => {
    console.log(`CONNECTION: state=${socket.state}`);
    socket.on('message', (message) => {
        console.log(`MESSAGE (protocol=${message.protocol}): ${message.payload.toString()}`);
    });
    socket.on('request', (message, replyCallback) => {
        console.log(`REQUEST (protocol=${message.protocol}): ${message.payload.toString()}`);
        replyCallback(new Promise((respond) => {
            setTimeout(() => {
                respond({
                    protocol: 'ilp',
                    contentType: lib_1.BtpMessageContentType.ApplicationOctetStream,
                    payload: Buffer.from('Goodbye!')
                });
            }, 1000);
        }));
    });
});
server.listen({
    path: '/tmp/btp-server.sock'
});
//# sourceMappingURL=server.js.map