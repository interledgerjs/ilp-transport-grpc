"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const socket_1 = require("../lib/socket");
const packet_1 = require("../lib/packet");
(async () => {
    const client = await socket_1.createConnection('ws+unix:///tmp/btp-server.sock', {
        headers: {
            authorization: 'Bearer TOKEN'
        }
    });
    client.message({
        protocol: 'ilp',
        contentType: packet_1.BtpMessageContentType.ApplicationOctetStream,
        payload: Buffer.from('Hello World!')
    });
    const resp = await client.request({
        protocol: 'ilp',
        contentType: packet_1.BtpMessageContentType.ApplicationOctetStream,
        payload: Buffer.from('Hello?')
    });
    console.log(`RESPONSE: ${resp.payload.toString()}`);
})();
//# sourceMappingURL=client.js.map