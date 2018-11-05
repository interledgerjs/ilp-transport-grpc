"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const lib_1 = require("../lib");
(async () => {
    const client = await lib_1.createConnection('127.0.0.1:5505', {
        headers: {
            authorization: 'Bearer TOKEN'
        },
        accountId: 'matt',
        accountInfo: {
            relation: 'parent',
            assetScale: 9,
            assetCode: 'xrp'
        }
    });
    client.on('error', (data) => {
        console.log(data);
    });
    client.on('request', (data) => {
        console.log(data);
    });
    console.time('test');
    let array = [];
    const resp = await client.request({
        protocol: 'ilp',
        contentType: lib_1.BtpMessageContentType.ApplicationOctetStream,
        payload: Buffer.from('Hello?')
    });
    console.log(resp.payload);
    console.timeEnd('test');
})();
//# sourceMappingURL=client.js.map