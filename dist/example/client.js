"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const lib_1 = require("../lib");
(async () => {
    const client = await lib_1.createConnection('ws+unix:///tmp/btp-server.sock', {
        headers: {
            authorization: 'Bearer TOKEN'
        }
    });
    client.message({
        protocol: 'ilp',
        contentType: lib_1.BtpMessageContentType.ApplicationOctetStream,
        payload: Buffer.from('Hello World!')
    });
    const resp = await client.request({
        protocol: 'ilp',
        contentType: lib_1.BtpMessageContentType.ApplicationOctetStream,
        payload: Buffer.from('Hello?')
    });
    console.log(`RESPONSE: ${resp.payload.toString()}`);
})();
//# sourceMappingURL=client.js.map