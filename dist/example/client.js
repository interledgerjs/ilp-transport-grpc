"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const lib_1 = require("../lib");
const uuid_1 = require("../lib/uuid");
(async () => {
    const client = await lib_1.createConnection('127.0.0.1:5001', {
        headers: {
            authorization: 'Bearer TOKEN'
        },
        accountId: 'matt',
        accountInfo: {
            relation: 'child',
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
    const errorPacket = {
        id: new uuid_1.default().toString(),
        correlationId: new uuid_1.default().toString(),
        type: lib_1.BtpPacketType.ERROR,
        code: lib_1.BtpErrorCode.UnknownCorrelationId,
        message: `No request found with id: ${new uuid_1.default().toString()}`
    };
})();
//# sourceMappingURL=client.js.map