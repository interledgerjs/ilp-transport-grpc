import {createConnection, BtpMessageContentType, BtpPacketType, BtpErrorCode, BtpErrorMessagePacket} from '../lib'
import UUID from '../lib/uuid'

(async () => {
  const client = await createConnection('127.0.0.1:5001', {
    headers: {
      authorization: 'Bearer TOKEN'
    },
    accountId: 'matt',
    accountInfo: {
      relation: 'child',
      assetScale: 9,
      assetCode: 'xrp'
    }
  })

  client.on('error', (data: any) =>  {
    console.log(data)
  })

  client.on('request', (data: any) =>  {
    console.log(data)
  })

  const errorPacket = {
    id: new UUID().toString(),
    correlationId: new UUID().toString(),
    type: BtpPacketType.ERROR,
    code: BtpErrorCode.UnknownCorrelationId,
    message: `No request found with id: ${new UUID().toString()}`
  } as BtpErrorMessagePacket

  // const resp = await client._send(errorPacket, () => null)
})()
