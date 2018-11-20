"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const lib_1 = require("../lib");
const ilp_logger_1 = require("ilp-logger");
const server = new lib_1.GrpcTransportServer({}, {
    log: ilp_logger_1.default('grpc-server'),
    authenticate: () => Promise.resolve({ id: 'test' })
});
server.on('listening', () => {
    console.log('Listening...');
});
server.on('connection', (stream) => {
    const { accountId, accountInfo } = stream;
    console.log(`CONNECTION: state=${stream.state}`);
    stream.on('message', (message) => {
        console.log(`MESSAGE (protocol=${message.protocol}): ${message.payload.toString()}`);
    });
    stream.on('request', (message, replyCallback) => {
        console.log(`REQUEST (protocol=${message.protocol}): ${message.payload.toString()}`);
        replyCallback(new Promise((respond) => {
            setTimeout(() => {
                respond({
                    protocol: 'ilp',
                    contentType: lib_1.FrameContentType.ApplicationOctetStream,
                    payload: Buffer.from('Goodbye!')
                });
            }, 100);
        }));
    });
    stream.on('error', (error) => console.log(error));
    stream.on('cancelled', (error) => console.log('cancelled', error));
});
server.listen({
    host: '0.0.0.0',
    port: 5001
});
//# sourceMappingURL=server.js.map