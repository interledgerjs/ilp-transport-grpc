import { createConnection, FrameType, TransportErrorCode, ErrorFrame, FrameContentType } from '../lib'
import UUID from '../lib/uuid'

(async () => {
  const client = await createConnection('127.0.0.1:5001', {
    accountId: 'matt',
    accountInfo: {
      relation: 'child',
      assetScale: 9,
      assetCode: 'xrp'
    }
  })

  client.on('error', (data: any) => {
    console.log(data)
  })

  client.on('request', (data: any) => {
    console.log(data)
  })

  const errorPacket = {
    id: new UUID().toString(),
    correlationId: new UUID().toString(),
    type: FrameType.ERROR,
    code: TransportErrorCode.UnknownCorrelationId,
    message: `No request found with id: ${new UUID().toString()}`
  } as ErrorFrame

  const resp = await client.message({
    protocol: 'test',
    contentType: FrameContentType.TextPlain,
    payload: Buffer.from('TEST')
  })
})()
