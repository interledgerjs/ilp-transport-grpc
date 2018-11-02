"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const lib_1 = require("../lib");
(async () => {
    const client = await lib_1.createConnection('127.0.0.1:5001', {
        headers: {
            authorization: 'Bearer TOKEN'
        }
    });
    client.on('error', (data) => {
        console.log(data);
    });
    await new Promise(res => setTimeout(res, 1000));
    client.message({
        protocol: 'ilp',
        contentType: lib_1.BtpMessageContentType.ApplicationOctetStream,
        payload: Buffer.from('Hello World!')
    });
    client.request({
        protocol: 'ilp',
        contentType: lib_1.BtpMessageContentType.ApplicationOctetStream,
        payload: Buffer.from('Hello?')
    }).then((resp) => {
        console.log(`RESPONSE: ${resp.payload.toString()}`);
    });
    client.request({
        protocol: 'ilp',
        contentType: lib_1.BtpMessageContentType.ApplicationOctetStream,
        payload: Buffer.from('Hello?')
    }).then((resp) => {
        console.log(`RESPONSE: ${resp.payload.toString()}`);
    });
    client.request({
        protocol: 'ilp',
        contentType: lib_1.BtpMessageContentType.ApplicationOctetStream,
        payload: Buffer.from('Hello?')
    }).then((resp) => {
        console.log(`RESPONSE: ${resp.payload.toString()}`);
    });
    client.request({
        protocol: 'ilp',
        contentType: lib_1.BtpMessageContentType.ApplicationOctetStream,
        payload: Buffer.from('Hello?')
    }).then((resp) => {
        console.log(`RESPONSE: ${resp.payload.toString()}`);
    });
})();
//# sourceMappingURL=client.js.map