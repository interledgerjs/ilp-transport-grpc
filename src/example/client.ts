import { createConnection } from '../lib/socket'
import { BtpMessageContentType } from '../lib/packet'

(async () => {
  const client = await createConnection('ws+unix:///tmp/btp-server.sock', {
    headers: {
      authorization: 'Bearer TOKEN'
    }
  })
  client.message({
    protocol: 'ilp',
    contentType: BtpMessageContentType.ApplicationOctetStream,
    payload: Buffer.from('Hello World!')
  })

  const resp = await client.request({
    protocol: 'ilp',
    contentType: BtpMessageContentType.ApplicationOctetStream,
    payload: Buffer.from('Hello?')
  })

  console.log(`RESPONSE: ${resp.payload.toString()}`)

})()
