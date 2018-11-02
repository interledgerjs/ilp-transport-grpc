"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const lib_1 = require("../lib");
(async () => {
    const client = await lib_1.createConnection('127.0.0.1:5001', {
        headers: {
            authorization: 'Bearer TOKEN'
        },
        accountId: 'test',
        accountInfo: {
            relation: 'child',
            assetScale: 9,
            assetCode: 'xrp'
        }
    });
    client.on('error', (data) => {
        console.log(data);
    });
    console.time('test');
    let array = [];
    for (let i = 0; i < 100000; i++) {
        array.push(client.request({
            protocol: 'ilp',
            contentType: lib_1.BtpMessageContentType.ApplicationOctetStream,
            payload: Buffer.from('Hello?')
        }));
    }
    await Promise.all(array);
    console.timeEnd('test');
})();
//# sourceMappingURL=client.js.map